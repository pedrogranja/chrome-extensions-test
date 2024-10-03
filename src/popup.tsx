import React, { useEffect, useState } from "react";
import { hydrateRoot } from 'react-dom/client';
import { FaroErrorBoundary, ReactIntegration, ReactRouterVersion } from '@grafana/faro-react';
import { getWebInstrumentations, initializeFaro, InternalLoggerLevel } from '@grafana/faro-web-sdk';

import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Button from 'react-bootstrap/Button';
import { SpanStatusCode } from '@opentelemetry/api';
import { TracingInstrumentation } from "@grafana/faro-web-tracing";
import { createRoutesFromChildren, matchRoutes, Routes, useLocation, useNavigationType } from "react-router-dom";

import { BatchSpanProcessor, WebTracerProvider, StackContextManager } from '@opentelemetry/sdk-trace-web';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';

import {
  type Context,
  propagation,
  trace,
  Span,
  context,
} from '@opentelemetry/api';

const NAME = 'Simple Extension Test';
const VERSION = '1.0.0';
const ENV = 'dev'

const faro = initializeFaro({
  internalLoggerLevel: InternalLoggerLevel.VERBOSE,
  url: `redacted`,
  apiKey: 'redacted',
  trackWebVitalsAttribution: true,
  instrumentations: [
    ...getWebInstrumentations({
      captureConsole: true,
    }),
    new TracingInstrumentation(),
    new ReactIntegration({
      router: {
        version: ReactRouterVersion.V6,
        dependencies: {
          createRoutesFromChildren,
          matchRoutes,
          Routes,
          useLocation,
          useNavigationType,
        },
      },
    }),
  ],
  app: {
    name: NAME,
    version: VERSION,
    environment: ENV,
  },
});

const resource = Resource.default().merge(
  new Resource({
    [SEMRESATTRS_SERVICE_NAME]: NAME,
    [SEMRESATTRS_SERVICE_VERSION]: VERSION,
  })
);

const provider = new WebTracerProvider({ resource });

provider.register({
  propagator: new W3CTraceContextPropagator(),
  contextManager: new ZoneContextManager(),
});

// register OTel with Faro
faro.api.initOTEL(trace, context);

const contextManager = new ZoneContextManager();
contextManager.enable();
faro.api.getOTEL()?.context.setGlobalContextManager(contextManager);

faro.api.pushLog(['Faro was initialized']);

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
    const otel = faro.api.getOTEL();

    interface Carrier {
      traceparent?: string;
      tracestate?: string;
    }

    if (otel) {
      const span = otel.trace.getTracer('popup').startSpan('user-interaction');
      const output: Carrier = {};

      // Serialize the traceparent and tracestate from context into
      // an output object.
      //
      // This example uses the active trace context, but you can
      // use whatever context is appropriate to your scenario.

      otel.context.with(otel.trace.setSpan(otel.context.active(), span), () => {
        propagation.inject(otel.context.active(), output);

        const { traceparent, tracestate } = output;

        console.log('Pedro logs', traceparent);
        console.log('Pedro logs', tracestate);

        faro.api.pushLog(['send button clicked']);
        chrome.runtime.sendMessage({ message: "button_clicked", traceparent }, 
          (response) => {
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            alert("Received")
          }
        );
      });
    }

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
    <FaroErrorBoundary>
      <Popup />
    </FaroErrorBoundary>
  </React.StrictMode>
);
