import fetch from 'node-fetch';

async function test() {
  try {
    const response = await fetch('http://localhost:3000/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        payload: {
          username: '黃世成',
          password: '123456' // Correct password
        }
      })
    });
    console.log('Response Status:', response.status);
    const data = await response.json();
    console.log('Response Data:', data);
  } catch (err) {
    console.error('Fetch Error:', err);
  }
}

test();
