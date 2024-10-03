// Background process in service worker
import { createInternalLogger, initializeFaro, InternalLoggerLevel, defaultGlobalObjectKey, defaultUnpatchedConsole, ExtendedError, Stacktrace } from '@grafana/faro-core';
import { parseStacktrace, ConsoleTransport, FetchTransport } from '@grafana/faro-web-sdk';

import { trace, context,  diag, DiagConsoleLogger, DiagLogLevel, SpanStatusCode } from '@opentelemetry/api';
import { BatchSpanProcessor, WebTracerProvider, StackContextManager } from '@opentelemetry/sdk-trace-web';
import { BasicTracerProvider, ConsoleSpanExporter, SimpleSpanProcessor, AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { TracingInstrumentation } from '@grafana/faro-web-tracing';
import { FaroSessionSpanProcessor, FaroTraceExporter } from '@grafana/faro-web-tracing';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';

import {
  type Context,
  propagation,
} from '@opentelemetry/api';

import * as api from '@opentelemetry/api';

const NAME = 'chrome-webextension-test-background';
const VERSION = '1.0.0';
const ENV = 'dev'

const internalLogger = createInternalLogger(defaultUnpatchedConsole, InternalLoggerLevel.VERBOSE);
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ALL);

// init faro
const faro = initializeFaro({
  internalLoggerLevel: InternalLoggerLevel.VERBOSE,
  globalObjectKey: defaultGlobalObjectKey,
  instrumentations: [],
  paused: false,
  app: {
    name: NAME,
    version: VERSION,
    environment: ENV
  },
  //metas: [],
  transports: [
    new FetchTransport({
      url: 'http://localhost:8027/collect',
      apiKey: 'redacted',
    }),
    new ConsoleTransport(),
  ],
  dedupe: false,
  isolate: false,
  metas: [],
  parseStacktrace,
  preventGlobalExposure: false,
  unpatchedConsole: defaultUnpatchedConsole
});

// set up otel
const resource = Resource.default().merge(
  new Resource({
    [SEMRESATTRS_SERVICE_NAME]: NAME,
    [SEMRESATTRS_SERVICE_VERSION]: VERSION,
  })
);

const provider = new WebTracerProvider(
  { resource,
    sampler: new AlwaysOnSampler()
 });

provider.addSpanProcessor(new BatchSpanProcessor(new FaroTraceExporter({ ...faro }), {
  scheduledDelayMillis: TracingInstrumentation.SCHEDULED_BATCH_DELAY_MS,
  maxExportBatchSize: 30,
}));

provider.register({
  propagator: new W3CTraceContextPropagator(),
  contextManager: new ZoneContextManager(),
});

registerInstrumentations({
  instrumentations: [new FetchInstrumentation()]
});

// register OTel with Faro
faro.api.initOTEL(trace, context);

faro.api.pushLog(['Faro background was initialized']);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  console.log("Hello from background script");

  internalLogger.error('test')
  internalLogger.debug('tttt') // does not work

  if (request.message === "button_clicked") {
    // push measurement
    faro.api.pushMeasurement({
      type: 'cart-transaction',
      values: {
        delay: 122,
        duration: 4000,
      },
    });

    // create trace
    const otel = faro.api.getOTEL();

    if (otel) {

      interface Carrier {
        traceparent?: string;
        tracestate?: string;
      }
      
      // Assume "input" is an object with 'traceparent' & 'tracestate' keys.
      const input: Carrier = {};
      input.traceparent = request.traceparent;
      console.log("Pedro logs, received traceparent: ", input.traceparent);
      
      // Extracts the 'traceparent' and 'tracestate' data into a context object.
      //
      // You can then treat this context as the active context for your
      // traces.
      let activeContext: Context = propagation.extract(context.active(), input);

      console.log("Starting OTEL trace");
      const span = otel.trace.getTracer('background').startSpan('click', {}, activeContext);
      
      console.log(span)
      otel.context.with(otel.trace.setSpan(otel.context.active(), span), () => {
          // push log
          faro.api.pushLog(['Message received']);
          span.setStatus({ code: SpanStatusCode.OK });
          console.log("Finishing OTEL trace");
          span.end();
      });

      const span2 = otel.trace.getTracer('background').startSpan('background process');
      otel.context.with(otel.trace.setSpan(otel.context.active(), span2), () => {
          // push log
          faro.api.pushLog(['Message received again!']);
          span2.setStatus({ code: SpanStatusCode.OK });
          console.log("Finishing OTEL trace 2");
          span2.end();
      });
    }

    sendResponse();
  }
});
