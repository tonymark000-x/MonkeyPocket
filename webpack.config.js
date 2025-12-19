const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const Dotenv = require('dotenv-webpack');

// 获取当前环境
const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  // 入口文件
  entry: './src/js/index.js',
  
  // 输出配置
  output: {
    filename: 'bundle.[contenthash].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true, // 每次打包清空dist目录
  },
  
  // 开发模式
  mode: process.env.NODE_ENV || 'development',
  
  // 开发服务器
  devServer: {
    static: path.resolve(__dirname, 'dist'),
    port: 3000,
    hot: true,
    open: true,
    historyApiFallback: true,
  },
  
  // 模块规则
  module: {
    rules: [
      { test: /\.css$/i, use: [MiniCssExtractPlugin.loader, 'css-loader'] },
      { test: /\.(png|svg|jpg|jpeg|gif)$/i, type: 'asset/resource' },
      { test: /\.(woff|woff2|eot|ttf|otf)$/i, type: 'asset/resource' },
      { test: /\.json$/, type: 'json' },
    ],
  },
  
  // 插件配置
  plugins: [
    // 只使用dotenv-webpack加载环境变量
    new Dotenv({
      path: './.env',
      systemvars: true,
      silent: true,
    }),
    
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: 'index.html',
      inject: 'body',
      minify: isProduction ? {
        removeComments: true,
        collapseWhitespace: true,
      } : false,
    }),
    
    new MiniCssExtractPlugin({
      filename: 'styles.[contenthash].css',
    }),
  ],
  
  resolve: {
    extensions: ['.js', '.json', '.css'],
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  
  optimization: {
    splitChunks: { chunks: 'all' },
    runtimeChunk: 'single',
  },
  
  performance: {
    hints: isProduction ? 'warning' : false,
  },
};