const axios = require('axios');

async function test() {
  try {
    const res = await axios.get('http://localhost:5000/api/reports/customers', {
      headers: {
        'Authorization': 'Bearer YOUR_TOKEN_HERE' // I don't have a token
      }
    });
    console.log('Count:', res.data.data.length);
  } catch (e) {
    console.log('Failed to fetch (likely auth):', e.message);
  }
}

// test();
