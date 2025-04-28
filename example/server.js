const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>EasyDeploy Sample App</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            text-align: center;
          }
          .container {
            background-color: #f5f5f5;
            border-radius: 10px;
            padding: 20px;
            margin-top: 50px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
          }
          h1 {
            color: #4CAF50;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🚀 EasyDeploy Sample App</h1>
          <p>Congratulations! Your app has been successfully deployed using EasyDeploy.</p>
          <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
          <p>Debug Mode: ${process.env.DEBUG || 'false'}</p>
        </div>
      </body>
    </html>
  `);
});

app.get('/api/info', (req, res) => {
  res.json({
    app: 'EasyDeploy Sample App',
    version: '1.0.0',
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date()
  });
});

app.listen(port, () => {
  console.log(`EasyDeploy sample app listening at http://localhost:${port}`);
}); 