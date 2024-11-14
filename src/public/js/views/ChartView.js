class ChartView {
    constructor() {
        this.charts = new Map();
        this.animations = {
            duration: 750,
            easing: 'easeOutQuart'
        };
    }

    // 收益分布图表
    createProfitDistributionChart(data, containerId) {
        const ctx = document.getElementById(containerId).getContext('2d');
        
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: '收益分布',
                    data: data.values,
                    backgroundColor: this._generateGradient(ctx, 'rgba(0, 153, 255, 0.5)'),
                    borderColor: 'rgba(0, 153, 255, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                animation: {
                    duration: this.animations.duration,
                    easing: this.animations.easing
                },
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => `收益: ${context.parsed.y.toFixed(2)}x`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    // 交易活动热力图
    createActivityHeatmap(data, containerId) {
        const ctx = document.getElementById(containerId).getContext('2d');
        
        return new Chart(ctx, {
            type: 'matrix',
            data: {
                datasets: [{
                    data: data.map(d => ({
                        x: d.hour,
                        y: d.day,
                        v: d.value
                    })),
                    backgroundColor(context) {
                        const value = context.dataset.data[context.dataIndex].v;
                        const alpha = value / 10;
                        return `rgba(0, 255, 136, ${alpha})`;
                    },
                    width: ({ chart }) => (chart.chartArea.width / 24) - 1,
                    height: ({ chart }) => (chart.chartArea.height / 7) - 1
                }]
            },
            options: {
                animation: {
                    duration: this.animations.duration,
                    easing: this.animations.easing
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            title() {
                                return '';
                            },
                            label(context) {
                                const v = context.dataset.data[context.dataIndex];
                                return [`${v.x}时 ${v.y}日`, `交易数: ${v.v}`];
                            }
                        }
                    }
                }
            }
        });
    }

    // 持仓分布饼图
    createHoldingsPieChart(data, containerId) {
        const ctx = document.getElementById(containerId).getContext('2d');
        
        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels,
                datasets: [{
                    data: data.values,
                    backgroundColor: [
                        'rgba(0, 255, 136, 0.8)',
                        'rgba(0, 153, 255, 0.8)',
                        'rgba(255, 183, 0, 0.8)',
                        'rgba(255, 59, 59, 0.8)'
                    ]
                }]
            },
            options: {
                animation: {
                    duration: this.animations.duration,
                    easing: this.animations.easing,
                    animateRotate: true,
                    animateScale: true
                },
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b);
                                const percentage = ((value * 100) / total).toFixed(1);
                                return `${context.label}: ${percentage}%`;
                            }
                        }
                    }
                }
            }
        });
    }

    // 生成渐变色
    _generateGradient(ctx, color) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        return gradient;
    }

    // 更新图表数据
    updateChart(chartId, newData) {
        const chart = this.charts.get(chartId);
        if (!chart) return;

        chart.data = newData;
        chart.update({
            duration: this.animations.duration,
            easing: this.animations.easing
        });
    }
} 