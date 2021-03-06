const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const { VueLoaderPlugin } = require('vue-loader');
const ChromeExtensionReloader = require('webpack-chrome-extension-reloader');

module.exports = {
  mode: 'development',
  entry: {
    background: ['@babel/polyfill', './src/scripts/background.js'],
    popup: ['@babel/polyfill', './src/scripts/popup.js'],
    notification: ['@babel/polyfill', './src/scripts/notification.js'],
    content: './src/scripts/content-script.js',
    injector: './src/scripts/injector.js',
  },
  devtool: 'cheap-module-source-map',
  plugins: [
    new ChromeExtensionReloader(),
    new CleanWebpackPlugin({
      cleanOnceBeforeBuildPattern: [path.join(process.cwd(), 'dist', '*')],
    }),
    new VueLoaderPlugin(),
    new CopyPlugin({
      patterns: [
        {
          from: 'manifest.json',
          to: path.join(process.cwd(), 'dist'),
          context: 'src',
        },
        {
          from: 'popup.html',
          to: path.join(process.cwd(), 'dist'),
          context: 'src',
        },
        {
          from: 'notification.html',
          to: path.join(process.cwd(), 'dist'),
          context: 'src',
        },
        {
          from: 'images',
          to: path.join(process.cwd(), 'dist', 'images'),
          context: 'src',
        },
      ],
    }),
  ],
  module: {
    rules: [
      {
        test: /\.(png|svg|jpg|gif)$/,
        loader: 'file-loader',
      },
      {
        test: /\.svg$/,
        use: ['vue-loader', 'vue-svg-loader'],
      },
      {
        test: /\.vue$/,
        loader: 'vue-loader',
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.m?js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
      {
        test: /\.s(c|a)ss$/,
        use: [
          //   "vue-style-loader",
          'style-loader',
          'css-loader',
          {
            loader: 'sass-loader',
            // Requires sass-loader@^7.0.0
            // options: {
            //   implementation: require("sass"),
            //   fiber: require("fibers"),
            //   indentedSyntax: false, // optional
            // },
            // Requires sass-loader@^8.0.0
            options: {
              implementation: require('sass'),
              sassOptions: {
                fiber: require('fibers'),
                indentedSyntax: false, // optional
              },
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.vue', '.js'],
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist', 'scripts'),
  },
};
