class ChartManager {
    constructor() {
        this.charts = {};
        this.initializeCharts();
    }

    initializeCharts() {
        // 交易量趋势图
        this.charts.volume = new Chart(
            document.getElementById('volumeChart'),
            {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Trading Volume',
                        data: [],
                        borderColor: '#0099FF',
                        backgroundColor: 'rgba(0, 153, 255, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            }
        );

        // 智能钱包分布图
        this.charts.distribution = new Chart(
            document.getElementById('distributionChart'),
            {
                type: 'doughnut',
                data: {
                    labels: ['High Performance', 'Medium', 'New'],
                    datasets: [{
                        data: [0, 0, 0],
                        backgroundColor: [
                            '#00FF88',
                            '#FFB700',
                            '#0099FF'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right'
                        }
                    }
                }
            }
        );
    }

    updateVolumeChart(data) {
        const chart = this.charts.volume;
        chart.data.labels = data.labels;
        chart.data.datasets[0].data = data.values;
        chart.update();
    }

    updateDistributionChart(data) {
        const chart = this.charts.distribution;
        chart.data.datasets[0].data = [
            data.highPerformance,
            data.medium,
            data.new
        ];
        chart.update();
    }
}

// 初始化图表管理器
const chartManager = new ChartManager();

// 更新图表数据示例
async function updateCharts() {
    try {
        // 获取交易量数据
        const volumeResponse = await fetch('/api/metrics/volume');
        const volumeData = await volumeResponse.json();
        chartManager.updateVolumeChart(volumeData);

        // 获取钱包分布数据
        const distributionResponse = await fetch('/api/metrics/distribution');
        const distributionData = await distributionResponse.json();
        chartManager.updateDistributionChart(distributionData);
    } catch (error) {
        console.error('Error updating charts:', error);
    }
}

// 定期更新图表
setInterval(updateCharts, 60000); // 每分钟更新一次 