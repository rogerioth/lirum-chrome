import path from 'path';
import { fileURLToPath } from 'url';
import CopyPlugin from 'copy-webpack-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  mode: 'development',
  devtool: 'source-map',
  entry: {
    options: ['./src/options/options.ts', './src/styles/options.css'],
    popup: ['./src/popup/popup.tsx', './src/styles/popup.css'],
    background: './src/background/background.ts',
    content: './src/content/content.ts',
    result: './src/result/result.tsx'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]/[name].js',
    clean: true
  },
  experiments: {
    topLevelAwait: true
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                module: 'esnext',
                moduleResolution: 'node',
                jsx: 'react-jsx'
              }
            }
          }
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx', '.css'],
    alias: {
      'react': path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom')
    },
    fallback: {
      "path": false,
      "fs": false
    }
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/manifest.json', to: 'manifest.json' },
        { from: 'src/options/options.html', to: 'options/options.html' },
        { from: 'src/popup/popup.html', to: 'popup/popup.html' },
        { from: 'src/result/result.html', to: 'result/result.html' },
        { from: 'src/assets', to: 'assets', noErrorOnMissing: true }
      ],
    }),
  ],
};