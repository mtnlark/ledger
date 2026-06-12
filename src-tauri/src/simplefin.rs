//! SimpleFIN Bridge client (read-only balance sync).
//!
//! The access URL embeds credentials, so it lives ONLY in the macOS Keychain —
//! never in app data, data.json, or backups (which can copy to iCloud). It is
//! claimed/stored/read entirely on the Rust side; JavaScript never sees it.

use base64::Engine;
use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "app.ledger.desktop.simplefin";
const KEYRING_USER: &str = "access_url";

#[derive(Debug, Deserialize, Serialize)]
pub struct SimplefinOrg {
  pub name: Option<String>,
  pub domain: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SimplefinAccount {
  pub id: String,
  pub name: String,
  pub currency: Option<String>,
  /// Decimal string per the SimpleFIN protocol (e.g. "113985.51").
  pub balance: String,
  #[serde(rename = "available-balance")]
  pub available_balance: Option<String>,
  /// Unix seconds.
  #[serde(rename = "balance-date")]
  pub balance_date: i64,
  pub org: Option<SimplefinOrg>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AccountsResponse {
  #[serde(default)]
  pub errors: Vec<String>,
  #[serde(default)]
  pub accounts: Vec<SimplefinAccount>,
}

fn keyring_entry() -> Result<keyring::Entry, String> {
  keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

fn get_access_url() -> Result<Option<String>, String> {
  match keyring_entry()?.get_password() {
    Ok(url) => Ok(Some(url)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

/// reqwest does not translate URL userinfo (user:pass@host) into an
/// Authorization header, so split credentials out for explicit Basic auth.
fn split_auth(access_url: &str) -> Result<(reqwest::Url, Option<(String, String)>), String> {
  let parsed = reqwest::Url::parse(access_url.trim()).map_err(|_| "Invalid access URL".to_string())?;
  let user = parsed.username().to_string();
  if user.is_empty() {
    return Ok((parsed, None));
  }
  let pass = parsed.password().unwrap_or_default().to_string();
  let mut clean = parsed.clone();
  clean.set_username("").ok();
  clean.set_password(None).ok();
  Ok((clean, Some((user, pass))))
}

async fn claim_setup_token(setup_token: &str) -> Result<String, String> {
  let bytes = base64::engine::general_purpose::STANDARD
    .decode(setup_token.trim())
    .map_err(|_| "Invalid setup token (not base64)".to_string())?;
  let claim_url = String::from_utf8(bytes).map_err(|_| "Invalid setup token".to_string())?;

  let resp = reqwest::Client::new()
    .post(claim_url.trim())
    .header("Content-Length", "0")
    .send()
    .await
    .map_err(|e| format!("Claim failed: {e}"))?;
  if !resp.status().is_success() {
    return Err(format!("Claim failed: HTTP {}", resp.status()));
  }
  let access_url = resp.text().await.map_err(|e| e.to_string())?;
  Ok(access_url.trim().to_string())
}

async fn fetch_accounts_internal(access_url: &str) -> Result<AccountsResponse, String> {
  let (base, auth) = split_auth(access_url)?;
  let url = format!(
    "{}/accounts?balances-only=1",
    base.as_str().trim_end_matches('/')
  );

  let mut request = reqwest::Client::new().get(&url);
  if let Some((user, pass)) = auth {
    request = request.basic_auth(user, Some(pass));
  }

  let resp = request
    .send()
    .await
    .map_err(|e| format!("SimpleFIN request failed: {e}"))?;
  if !resp.status().is_success() {
    return Err(format!("SimpleFIN returned HTTP {}", resp.status()));
  }
  resp
    .json::<AccountsResponse>()
    .await
    .map_err(|e| format!("Could not parse SimpleFIN response: {e}"))
}

/// Link via a SimpleFIN setup token (base64 claim URL) or, for the public
/// demo, a raw access URL. Validates by fetching before storing in Keychain.
#[tauri::command]
pub async fn simplefin_link(setup_token: String) -> Result<AccountsResponse, String> {
  let token = setup_token.trim();
  let access_url = if token.starts_with("http://") || token.starts_with("https://") {
    token.to_string()
  } else {
    claim_setup_token(token).await?
  };

  let accounts = fetch_accounts_internal(&access_url).await?;
  keyring_entry()?
    .set_password(&access_url)
    .map_err(|e| format!("Keychain error: {e}"))?;
  Ok(accounts)
}

#[tauri::command]
pub fn simplefin_is_linked() -> Result<bool, String> {
  Ok(get_access_url()?.is_some())
}

#[tauri::command]
pub fn simplefin_unlink() -> Result<(), String> {
  match keyring_entry()?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
pub async fn simplefin_fetch_accounts() -> Result<AccountsResponse, String> {
  let url = get_access_url()?.ok_or_else(|| "SimpleFIN is not linked".to_string())?;
  fetch_accounts_internal(&url).await
}

#[cfg(test)]
mod tests {
  use super::*;

  /// Captured from the public demo endpoint (trimmed); includes fields we
  /// ignore (transactions, holdings) to prove tolerant parsing.
  const DEMO_FIXTURE: &str = r#"{
    "errors": [],
    "accounts": [
      {
        "id": "Demo Savings",
        "name": "SimpleFIN Savings",
        "currency": "USD",
        "balance": "113985.51",
        "available-balance": "113985.51",
        "balance-date": 1781222400,
        "transactions": [
          {"id": "1781164800", "posted": 1781164800, "amount": "-55.50", "description": "Fishing bait"}
        ],
        "holdings": [
          {"id": "25bc4910", "cost_basis": "55.00", "market_value": "105884.8", "symbol": "AAPL"}
        ],
        "org": {
          "domain": "beta-bridge.simplefin.org",
          "name": "SimpleFIN Demo",
          "sfin-url": "https://beta-bridge.simplefin.org/simplefin"
        }
      },
      {
        "id": "Demo Checking",
        "name": "SimpleFIN Checking",
        "currency": "USD",
        "balance": "24119.91",
        "available-balance": "24119.91",
        "balance-date": 1781222400,
        "org": {"domain": "beta-bridge.simplefin.org", "name": "SimpleFIN Demo"}
      }
    ]
  }"#;

  #[test]
  fn parses_demo_accounts_response() {
    let parsed: AccountsResponse = serde_json::from_str(DEMO_FIXTURE).unwrap();
    assert!(parsed.errors.is_empty());
    assert_eq!(parsed.accounts.len(), 2);

    let savings = &parsed.accounts[0];
    assert_eq!(savings.id, "Demo Savings");
    assert_eq!(savings.balance, "113985.51");
    assert_eq!(savings.balance_date, 1781222400);
    assert_eq!(savings.org.as_ref().unwrap().name.as_deref(), Some("SimpleFIN Demo"));
  }

  #[test]
  fn tolerates_missing_optional_fields() {
    let parsed: AccountsResponse =
      serde_json::from_str(r#"{"accounts": [{"id": "x", "name": "X", "balance": "1.00", "balance-date": 0}]}"#)
        .unwrap();
    assert_eq!(parsed.accounts[0].available_balance, None);
    assert!(parsed.accounts[0].org.is_none());
  }

  #[test]
  fn splits_userinfo_into_basic_auth() {
    let (url, auth) = split_auth("https://demo:demopass@example.org/simplefin").unwrap();
    assert_eq!(url.as_str(), "https://example.org/simplefin");
    assert_eq!(auth, Some(("demo".to_string(), "demopass".to_string())));

    let (url2, auth2) = split_auth("https://example.org/simplefin").unwrap();
    assert_eq!(url2.as_str(), "https://example.org/simplefin");
    assert_eq!(auth2, None);
  }
}
