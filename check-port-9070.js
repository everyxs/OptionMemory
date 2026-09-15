const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 9070,
  path: '/',
  method: 'HEAD',
  timeout: 5000
};

const req = http.request(options, (res) => {
  console.log(`状态码: ${res.statusCode}`);
  console.log('响应头:');
  console.log(JSON.stringify(res.headers, null, 2));
  res.resume(); // 消费响应数据以释放内存
});

req.on('error', (err) => {
  if (err.code === 'ECONNREFUSED') {
    console.error('端口 9070 没有 HTTP 服务在运行 (连接被拒绝)');
  } else if (err.code === 'ETIMEDOUT') {
    console.error('连接超时，端口 9070 可能没有响应');
  } else {
    console.error(`请求出错: ${err.message}`);
  }
  process.exit(1);
});

req.on('timeout', () => {
  console.error('请求超时');
  req.destroy();
  process.exit(1);
});

req.end();
