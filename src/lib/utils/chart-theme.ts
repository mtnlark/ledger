export interface ChartTheme {
  textColor: string;
  mutedTextColor: string;
  gridColor: string;
  tooltipBg: string;
  tooltipText: string;
  surfaceColor: string;
}

export function getChartTheme(): ChartTheme {
  const isDark = typeof document !== 'undefined'
    && document.documentElement.classList.contains('dark');

  return {
    textColor: isDark ? '#BDB7AD' : '#5C5751',
    mutedTextColor: '#8A847C',
    gridColor: isDark ? 'rgba(250, 248, 245, 0.08)' : 'rgba(45, 42, 38, 0.08)',
    tooltipBg: isDark ? '#F5F2ED' : '#2D2A26',
    tooltipText: isDark ? '#2D2A26' : '#F5F2ED',
    surfaceColor: isDark ? '#262320' : '#FFFFFF',
  };
}
