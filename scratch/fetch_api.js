const http = require('http');

http.get('http://localhost:3000/api/v1/reports/sales/analysis', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('API Response Summary:', json.data.summary);
    } catch (e) {
      console.log('Error parsing JSON:', data.substring(0, 500));
    }
  });
}).on('error', (err) => {
  console.log('HTTP Error:', err.message);
});
