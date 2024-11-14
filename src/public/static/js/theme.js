class ThemeManager {
    constructor() {
        this.themes = {
            dark: {
                '--bg-primary': '#0D0D0F',
                '--bg-secondary': '#1A1B1E',
                '--bg-card': '#1E1F23',
                '--text-primary': '#FFFFFF',
                '--text-secondary': '#A0A0A0',
                '--accent-green': '#00FF88',
                '--accent-red': '#FF3B3B',
                '--accent-blue': '#0099FF',
                '--border-color': '#2A2B2E',
                '--hover-color': '#2C2D32'
            },
            light: {
                '--bg-primary': '#F5F5F7',
                '--bg-secondary': '#FFFFFF',
                '--bg-card': '#FFFFFF',
                '--text-primary': '#1A1B1E',
                '--text-secondary': '#666666',
                '--accent-green': '#00B368',
                '--accent-red': '#E63946',
                '--accent-blue': '#0066CC',
                '--border-color': '#E5E5E5',
                '--hover-color': '#F0F0F0'
            }
        };

        this.currentTheme = localStorage.getItem('theme') || 'dark';
        this.init();
    }

    init() {
        this.applyTheme(this.currentTheme);
        this.setupThemeToggle();
        this.setupMediaQueryListener();
    }

    applyTheme(theme) {
        const root = document.documentElement;
        const themeColors = this.themes[theme];
        Object.entries(themeColors).forEach(([property, value]) => {
            root.style.setProperty(property, value);
        });
        localStorage.setItem('theme', theme);
        this.currentTheme = theme;
        document.body.setAttribute('data-theme', theme);
    }

    setupThemeToggle() {
        const toggle = document.getElementById('themeToggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
                this.applyTheme(newTheme);
                this.updateCharts();
            });
        }
    }

    setupMediaQueryListener() {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addListener((e) => {
            if (!localStorage.getItem('theme')) {
                this.applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }

    updateCharts() {
        // 更新图表主题
        if (window.chartManager) {
            Object.values(window.chartManager.charts).forEach(chart => {
                chart.options.plugins.legend.labels.color = this.currentTheme === 'dark' ? '#FFFFFF' : '#1A1B1E';
                chart.options.scales.y.grid.color = this.currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
                chart.options.scales.y.ticks.color = this.currentTheme === 'dark' ? '#A0A0A0' : '#666666';
                chart.options.scales.x.ticks.color = this.currentTheme === 'dark' ? '#A0A0A0' : '#666666';
                chart.update();
            });
        }
    }
}

// 初始化主题管理器
const themeManager = new ThemeManager(); 