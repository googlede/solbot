async function fetchTop100Tokens() {
  try {
    const response = await fetch('/api/tokens/top100');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    if (data.status === 'success') {
      displayTokens(data.data);
    } else {
      throw new Error(data.message || 'Failed to fetch tokens');
    }
  } catch (error) {
    console.error('Error fetching tokens:', error);
    displayError(error.message);
  }
}

function displayTokens(tokens) {
  const tableBody = document.querySelector('table tbody');
  tableBody.innerHTML = ''; // 清空现有内容

  tokens.forEach(token => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${token.symbol}</td>
      <td>${token.address}</td>
      <td>${formatUSD(token.marketCap)}</td>
      <td>${formatUSD(token.price)}</td>
    `;
    tableBody.appendChild(row);
  });
}

function formatUSD(value) {
  if (!value) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value);
}

function displayError(message) {
  const tableBody = document.querySelector('table tbody');
  tableBody.innerHTML = `
    <tr>
      <td colspan="4" class="error-message">
        Error loading data: ${message}
      </td>
    </tr>
  `;
}

// 页面加载时获取数据
document.addEventListener('DOMContentLoaded', fetchTop100Tokens); 