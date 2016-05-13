var path = require('path');
var webpack = require('webpack');

module.exports = {
  entry: ['./src/main'],
  output: {
    path: path.normalize(__dirname + '/'),
    library: "tfetchWs",
    filename: "fetch.js"
  },

  module: {
    loaders: [
      {
        test: /(\.jsx?$)/,
        exclude: /(node_modules)/,
        loaders: ['babel'],
        include: path.normalize(__dirname + '/src')
      }
    ]
  },
  resolve: {
    root: [
      path.normalize(__dirname + '/src')
    ],
    extensions: ['', '.js', '.jsx'],
    alias: {}
  },
  plugins: [new webpack.optimize.UglifyJsPlugin({
    compress: {warnings: false}
  })]
};


