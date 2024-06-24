import { createRequire } from 'node:module';
import path from 'node:path';
import webpack from 'webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';

const cwd = process.cwd();

const require = createRequire(import.meta.url);

export default {
  mode: 'development',
  // devtool: 'eval-cheap-source-map',
  entry: {
    main: path.resolve(cwd, 'src', 'shared', 'playground', 'index.tsx'),
    'editor.worker': 'monaco-editor/esm/vs/editor/editor.worker.js',
    'ts.worker': 'monaco-editor/esm/vs/language/typescript/ts.worker.js',
  },
  output: {
    globalObject: 'self',
    filename: '[name].bundle.js',
    chunkFilename: '[name].chunk.js',
    path: path.resolve(cwd, 'public', 'playground'),
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx|tsx|ts)$/,
        exclude: /node_modules/,
        // use: [
        //   {
        //     loader: require.resolve('babel-loader'),
        //     options: {
        //       presets: ['@babel/preset-env', '@babel/preset-typescript', '@babel/preset-react'],
        //       // plugins: [isDevelopment && require.resolve('react-refresh/babel')].filter(Boolean),
        //     },
        //   },
        // ],
        use: 'ts-loader',
      },
      {
        test: /\.s[ac]ss$/i,
        use: [
          'style-loader',
          // MiniCssExtractPlugin.loader, // production
          // Translates CSS into CommonJS
          'css-loader',
          'postcss-loader',
          // Compiles Sass to CSS
          'sass-loader',
        ],
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
      {
        test: /\.ttf$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new webpack.SourceMapDevToolPlugin({
      filename: '[file].map',
      exclude: ['editor.worker.js', 'ts.worker.js'],
    }),
    // new MiniCssExtractPlugin({
    //   filename: '[name].css',
    //   chunkFilename: '[id].css',
    // }),
    new HtmlWebpackPlugin({
      cache: false,
      title: 'Headless Service Playground',
      template: path.resolve(cwd, 'src', 'shared', 'playground', 'index.html'),
    }),
  ],
  // optimization: {
  //   splitChunks: {
  //     cacheGroups: {
  //       commons: {
  //         name: 'commons',
  //         minChunks: 2,
  //         chunks: 'initial',
  //       },
  //     },
  //   },
  // },
  // devServer: {
  //   headers: {
  //     'X-Frame-Options': 'sameorigin',
  //   },
  // },
};
