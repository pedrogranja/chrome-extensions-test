# Chrome Extension Example

The objective of this repo, is to showcase a simple extension working with grafana cloud. Both the Popup and the 
service worker (Extension background process) should be traced and correlated together, with the background process having manual instrumentation using OTEL. Furhthermore, it should also be possible to see in grafana, in the application overview page the service worker and the popup in the Frontend tab 

## Prerequisites

* [node + npm](https://nodejs.org/) (e.g node:20)
* A Grafana cloud account

## Project Structure

* src/typescript: TypeScript source files
* src/assets: static files
* dist: Chrome Extension directory
* dist/js: Generated JavaScript files
* config.alloy: the configuration for a local alloy instance.

## Input credentials
1. In the popup.tsx file input your grafana cloud credentials
2. In the config.alloy input your grafana cloud otel endpoint user and token password

## Install

```
npm install
```

## Build

```
npm run build
```

## Watch

```
npm run watch
```

## Start Alloy

In order to collect the telemetry data from the service worker, an alloy instance is necessary. Run alloy with the configuration provided in the root directory in config.alloy


## How to load the extension on Chrome

1. Build the extension
2. Go to [chrome://extensions](chrome://extensions)
3. Click on `Load unpacked`
4. Choose the `dist` directory
