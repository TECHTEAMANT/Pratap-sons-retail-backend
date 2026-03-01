async function testApi() {
  const url = 'http://localhost:3000/api/masters/vendors?search_vendor_code=RMU';
  try {
    const res = await fetch(url);
    const json = await res.json();
    console.log('Response status:', res.status);
    console.log('Data length:', json.data?.length);
    console.log('Vendor codes:', json.data?.map(v => v.vendor_code));
  } catch (err) {
    console.error(err);
  }
}

testApi();
