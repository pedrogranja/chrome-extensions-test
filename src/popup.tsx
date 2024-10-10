import React, { useEffect, useState } from "react";
import { hydrateRoot } from 'react-dom/client';

import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Button from 'react-bootstrap/Button';

import { trace, context, SpanStatusCode, SpanKind, Exception } from '@opentelemetry/api';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ConsoleSpanExporter, SimpleSpanProcessor, AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION, SEMRESATTRS_SERVICE_NAMESPACE } from '@opentelemetry/semantic-conventions';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { CustomExporter } from './custom_exporter';
import { type Context, propagation } from '@opentelemetry/api';
import { SimpleLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { events } from '@opentelemetry/api-events';
import { EventLoggerProvider } from '@opentelemetry/sdk-events';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { CustomLogExporter } from './custom_logs_exporter';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { HoneycombWebSDK } from '@honeycombio/opentelemetry-web';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';


const NAME = 'Simple Extension Test new';
const VERSION = '1.0.0';


const configDefaults = {
  ignoreNetworkEvents: true,
  // propagateTraceHeaderCorsUrls: [
  // /.+/g, // Regex to match your backend URLs. Update to the domains you wish to include.
  // ]
}

const sdk = new HoneycombWebSDK({
  // endpoint: "https://api.eu1.honeycomb.io/v1/traces", // Send to EU instance of Honeycomb. Defaults to sending to US instance.
  debug: true, // Set to false for production environment.
  apiKey: 'api_key', // Replace with your Honeycomb Ingest API Key.
  serviceName: NAME, // Replace with your application name. Honeycomb uses this string to find your dataset when we receive your data. When no matching dataset exists, we create a new one with this name if your API Key has the appropriate permissions.
  tracesEndpoint: 'http://localhost:4318/v1/traces',
  instrumentations: [getWebAutoInstrumentations({
    // Loads custom configuration for xml-http-request instrumentation.
    '@opentelemetry/instrumentation-xml-http-request': configDefaults,
    '@opentelemetry/instrumentation-fetch': configDefaults,
    '@opentelemetry/instrumentation-document-load': configDefaults,
  })],
});
sdk.start();


const Popup = () => {
  const [count, setCount] = useState(0);
  const [currentURL, setCurrentURL] = useState<string>();

  useEffect(() => {
    chrome.action.setBadgeText({ text: count.toString() });
  }, [count]);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      setCurrentURL(tabs[0].url);
    });
  }, []);

  const changeBackground = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const tab = tabs[0];
      if (tab.id) {
        chrome.tabs.sendMessage(
          tab.id,
          {
            color: "#555555",
          },
          (msg) => {
            console.log("result message:", msg);
          }
        );
      }
    });
  };

  const sendMessageButton = () => {

    interface Carrier {
      traceparent?: string;
      tracestate?: string;
    }

      const span = trace.getTracer('popup').startSpan('user-interaction', {
        kind: SpanKind.SERVER,
        attributes : {
          'page-url' : 'this-is-a-test-page-url'
        }
      },);
      const output: Carrier = {};

      // Serialize the traceparent and tracestate from context into
      // an output object.
      //
      // This example uses the active trace context, but you can
      // use whatever context is appropriate to your scenario.

      context.with(trace.setSpan(context.active(), span), () => {
        propagation.inject(context.active(), output);

        const { traceparent, tracestate } = output;

        console.log('Pedro logs', traceparent);
        console.log('Pedro logs', tracestate);

        chrome.runtime.sendMessage({ message: "button_clicked", traceparent }, 
          (response) => {
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            alert("Received")
          }
        );
      });

  }

  return (
    <>
      <div>
        <ul style={{ minWidth: "700px" }}>
          <li>Current URL: {currentURL}</li>
          <li>Current Time: {new Date().toLocaleTimeString()}</li>
        </ul>
      </div>
      <ButtonGroup>
        <Button
          onClick={() => setCount(count + 1)}
          style={{ marginRight: "5px" }}
        >
          count up
        </Button>
        <Button onClick={changeBackground}>change background</Button>
        <Button onClick={sendMessageButton}>send message</Button>
      </ButtonGroup>
    </>
  );
};

hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <React.StrictMode>
      <Popup />
  </React.StrictMode>
);
