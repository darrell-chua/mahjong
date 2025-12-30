#!/usr/bin/env node

/**
 * 连接诊断工具
 * 检查服务器配置和连接问题
 */

const http = require('http');
const net = require('net');

console.log('🔍 开始诊断连接问题...\n');

// 检查端口是否被占用
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.listen(port, () => {
      server.once('close', () => {
        resolve({ available: true, port });
      });
      server.close();
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve({ available: false, port, error: '端口已被占用' });
      } else {
        resolve({ available: false, port, error: err.message });
      }
    });
  });
}

// 检查服务器是否响应
function checkServer(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve({ 
        running: true, 
        port, 
        statusCode: res.statusCode,
        headers: res.headers 
      });
    });
    
    req.on('error', (err) => {
      resolve({ 
        running: false, 
        port, 
        error: err.message 
      });
    });
    
    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ 
        running: false, 
        port, 
        error: '连接超时' 
      });
    });
  });
}

// 主诊断函数
async function diagnose() {
  const port = process.env.PORT || 3000;
  
  console.log('📋 检查项目：');
  console.log(`   1. 端口 ${port} 是否可用`);
  console.log(`   2. 服务器是否在运行`);
  console.log(`   3. Socket.IO 端点是否可访问\n`);
  
  // 检查端口
  console.log('1️⃣ 检查端口可用性...');
  const portCheck = await checkPort(port);
  if (portCheck.available) {
    console.log(`   ✅ 端口 ${port} 可用\n`);
  } else {
    console.log(`   ❌ 端口 ${port} 不可用: ${portCheck.error}\n`);
    console.log('   💡 解决方案：');
    console.log('      - 关闭占用该端口的程序');
    console.log('      - 或设置环境变量 PORT 使用其他端口\n');
  }
  
  // 检查服务器
  console.log('2️⃣ 检查服务器状态...');
  const serverCheck = await checkServer(port);
  if (serverCheck.running) {
    console.log(`   ✅ 服务器正在运行 (状态码: ${serverCheck.statusCode})\n`);
  } else {
    console.log(`   ❌ 服务器未运行: ${serverCheck.error}\n`);
    console.log('   💡 解决方案：');
    console.log('      - 运行命令: npm start');
    console.log('      - 或运行命令: node server.js\n');
  }
  
  // 检查 Socket.IO 端点
  console.log('3️⃣ 检查 Socket.IO 配置...');
  try {
    const socketIoCheck = await checkServer(port);
    if (socketIoCheck.running) {
      console.log(`   ✅ HTTP 服务器正常，Socket.IO 应该可以工作\n`);
    } else {
      console.log(`   ⚠️  无法连接到服务器\n`);
    }
  } catch (err) {
    console.log(`   ⚠️  检查 Socket.IO 时出错: ${err.message}\n`);
  }
  
  // 总结
  console.log('📊 诊断总结：');
  if (portCheck.available && !serverCheck.running) {
    console.log('   ⚠️  端口可用但服务器未运行');
    console.log('   → 请运行: npm start\n');
  } else if (!portCheck.available && serverCheck.running) {
    console.log('   ✅ 服务器正在运行（端口可能被其他进程占用）\n');
  } else if (portCheck.available && serverCheck.running) {
    console.log('   ✅ 一切正常！服务器应该可以正常连接\n');
  } else {
    console.log('   ❌ 发现问题，请查看上面的详细信息\n');
  }
  
  console.log('💡 常见问题排查：');
  console.log('   1. 确保已安装依赖: npm install');
  console.log('   2. 确保服务器正在运行: npm start');
  console.log('   3. 检查防火墙设置');
  console.log('   4. 如果使用代理，检查代理配置');
  console.log('   5. 查看浏览器控制台的错误信息\n');
}

// 运行诊断
diagnose().catch(console.error);

