async function fetchTokens() {
  try {
    const response = await fetch('/api/tokens/top100');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching tokens:', error);
    throw error;
  }
}

// 导出函数供其他模块使用
window.TokenService = {
  fetchTokens
}; 