// Test script to manually trigger Inngest workflow
const fetch = globalThis.fetch || require('node-fetch');

async function testTrigger() {
  try {
    console.log('Testing Inngest trigger...');
    
    const response = await fetch('http://localhost:3000/api/inngest/trigger-parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        flyerImageId: 'test-id-123',
        storageUrl: 'https://example.com/test-image.jpg'
      }),
    });

    const result = await response.text();
    console.log('Status:', response.status);
    console.log('Response:', result);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testTrigger();
