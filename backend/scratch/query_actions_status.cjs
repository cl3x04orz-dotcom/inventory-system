const https = require('https');

const options = {
  hostname: 'api.github.com',
  path: '/repos/cl3x04orz-dotcom/inventory-system/actions/runs?per_page=5',
  headers: {
    'User-Agent': 'Mozilla/5.0'
  }
};

https.get(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const runs = JSON.parse(data).workflow_runs;
      console.log('--- GitHub Actions Runs ---');
      runs.forEach(run => {
        console.log(`ID: ${run.id} | Commit: "${run.head_commit.message}" | Status: ${run.status} | Conclusion: ${run.conclusion}`);
      });
    } catch (e) {
      console.error('Failed to parse response:', e);
      console.log(data);
    }
  });
}).on('error', (e) => {
  console.error(e);
});
