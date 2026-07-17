import fetch from 'node-fetch';

async function test() {
  // Step 1: Login
  const loginRes = await fetch('http://localhost:3000/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'login',
      payload: { username: 'guest', password: 'guest' }
    })
  });
  const login = await loginRes.json();
  console.log('[Login]', login.success ? 'OK' : login.error);
  const token = login.token;

  // Step 2: getSalesByDateRange
  const today = new Date().toISOString().split('T')[0];
  const rangeRes = await fetch('http://localhost:3000/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'getSalesByDateRange',
      payload: { startDate: today, endDate: today },
      token
    })
  });
  const rangeData = await rangeRes.json();
  console.log('[getSalesByDateRange] count:', Array.isArray(rangeData) ? rangeData.length : 'NOT ARRAY');
  if (Array.isArray(rangeData) && rangeData.length > 0) {
    console.log('[First record sample]:', JSON.stringify(rangeData[0], null, 2));
  } else {
    // try last month
    const start = new Date();
    start.setDate(1);
    const startStr = start.toISOString().split('T')[0];
    const rangeRes2 = await fetch('http://localhost:3000/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getSalesByDateRange',
        payload: { startDate: startStr, endDate: today },
        token
      })
    });
    const rangeData2 = await rangeRes2.json();
    console.log('[getSalesByDateRange this month] count:', Array.isArray(rangeData2) ? rangeData2.length : 'NOT ARRAY');
    if (Array.isArray(rangeData2) && rangeData2.length > 0) {
      console.log('[First record sample]:', JSON.stringify(rangeData2[0], null, 2));
    } else {
      console.log('[Full response]:', rangeData2);
    }
  }
}

test().catch(console.error);
