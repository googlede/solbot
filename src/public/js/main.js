document.addEventListener('DOMContentLoaded', () => {
    initSorting();
    fetchTokens();
    setInterval(fetchTokens, 60000);
});

// 其他函数... 