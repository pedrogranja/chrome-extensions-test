// Background process in service worker
import { trace, context, SpanStatusCode, SpanKind, Exception } from '@opentelemetry/api';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { ConsoleSpanExporter, SimpleSpanProcessor, AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_NAMESPACE } from '@opentelemetry/semantic-conventions';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { CustomExporter } from './custom_exporter';
import { type Context, propagation } from '@opentelemetry/api';
import { SimpleLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { events } from '@opentelemetry/api-events';
import { EventLoggerProvider } from '@opentelemetry/sdk-events';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { CustomLogExporter } from './custom_logs_exporter';

const NAME = 'chrome-webextension-test-background-new';

function sleep(milliseconds : any) {
  var start = new Date().getTime();
  for (var i = 0; i < 1e7; i++) {
    if ((new Date().getTime() - start) > milliseconds){
      break;
    }
  }
}

const provider = new WebTracerProvider(
  {
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: NAME,
      [SEMRESATTRS_SERVICE_NAMESPACE] : 'new_test'
    }),
    sampler: new AlwaysOnSampler()
 });

provider.addSpanProcessor(new SimpleSpanProcessor(new CustomExporter({
  // optional - default url is http://localhost:4318/v1/traces
  url: 'http://localhost:4318/v1/traces',
  // optional - collection of custom headers to be sent with each request, empty by default
})));

provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));

provider.register({
  propagator: new W3CTraceContextPropagator()
});

registerInstrumentations({
  instrumentations: [new FetchInstrumentation()]
});


// Events setup
const loggerProvider = new LoggerProvider({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: NAME,
    [SEMRESATTRS_SERVICE_NAMESPACE] : 'new_test'
  }),
});
loggerProvider.addLogRecordProcessor(
  new SimpleLogRecordProcessor(new CustomLogExporter({
    // optional - default url is http://localhost:4318/v1/traces
    url: 'http://localhost:4318/v1/logs',
    // optional - collection of custom headers to be sent with each request, empty by default
    headers: {
      "Content-Type": "application/json",
    },
  }))
);

// Register a global EventLoggerProvider.
// This would be used by instrumentations, similar to how the global TracerProvider,
// LoggerProvider and MeterProvider work.
const eventLoggerProvider = new EventLoggerProvider(loggerProvider);
events.setGlobalEventLoggerProvider(eventLoggerProvider);

// Get an EventLogger from the global EventLoggerProvider
const eventLogger = events.getEventLogger('default');


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "button_clicked") {

    interface Carrier {
      traceparent?: string;
      tracestate?: string;
    }
    
    // Assume "input" is an object with 'traceparent' & 'tracestate' keys.
    const input: Carrier = {};
    input.traceparent = request.traceparent;
    
    // Extracts the 'traceparent' and 'tracestate' data into a context object.
    //
    // You can then treat this context as the active context for your
    // traces.
    let activeContext: Context = propagation.extract(context.active(), input);

    console.log("Starting OTEL trace");
    const span = provider.getTracer('background').startSpan('click', {
      kind: SpanKind.SERVER,
    }, activeContext);
    
    context.with(trace.setSpan(context.active(), span), () => {
      try {
        // push log
        throw new Error("I'm a very bad error too :(");
      }
      catch (e) {
        // logging an event in an instrumentation library
        eventLogger.emit(
          { name: (<Error>e).name,
          attributes: { app_name: 
                        'Simple Extension Test', 
                        kind: 'exception'
                      },
          data: (<Error>e).message,
          severityNumber: SeverityNumber.ERROR,
          context: context.active()
        });
      }
      // push log
      span.setStatus({ code: SpanStatusCode.OK });
      console.log("Finishing OTEL trace");
      span.end();
    });

    const span2 = trace.getTracer('background').startSpan('background process', {
      kind: SpanKind.SERVER,
    });
    context.with(trace.setSpan(context.active(), span2), () => {
        try {
          // push log
          sleep(1000);
          throw new Error("I'm a very bad error");
        }
        catch (e) {
          console.log("Error");
          span2.recordException(<Error>e);
          span2.setStatus({ code: SpanStatusCode.ERROR });
        }
        console.log("Finishing OTEL trace 2");
        span2.end();
    });

    sendResponse();
  }
});
