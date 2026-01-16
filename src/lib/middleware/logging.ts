import type { NextRequest, NextResponse } from "next/server";
import { LogEntry } from "./types";

class Logger {
  private serviceName: string;
  private environment: string;

  constructor(
    serviceName = "employee-app",
    environment = process.env.NODE_ENV || "development"
  ) {
    this.serviceName = serviceName;
    this.environment = environment;
  }

  private createLogEntry(
    level: LogEntry["level"],
    message: string,
    metadata: Partial<LogEntry> = {}
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      requestId: metadata.requestId || crypto.randomUUID(),
      method: metadata.method || "",
      url: metadata.url || "",
      ip: metadata.ip || "",
      userAgent: metadata.userAgent,
      duration: metadata.duration,
      status: metadata.status,
      message,
      metadata: {
        service: this.serviceName,
        environment: this.environment,
        ...metadata.metadata,
      },
    };
  }

  info(message: string, metadata?: Partial<LogEntry>) {
    const entry = this.createLogEntry("info", message, metadata);
    this.output(entry);
  }

  warn(message: string, metadata?: Partial<LogEntry>) {
    const entry = this.createLogEntry("warn", message, metadata);
    this.output(entry);
  }

  error(message: string, metadata?: Partial<LogEntry>) {
    const entry = this.createLogEntry("error", message, metadata);
    this.output(entry);
  }

  private output(entry: LogEntry) {
    // Console output (always)
    console.log(JSON.stringify(entry));

    // Send to external services in production
    if (this.environment === "production") {
      this.sendToExternalServices(entry);
    }
  }

  private async sendToExternalServices(entry: LogEntry) {
    try {
      // Option A: Send to Datadog
      if (process.env.DATADOG_API_KEY) {
        await fetch(
          "https://http-intake.logs.datadoghq.com/v1/input/" +
            process.env.DATADOG_API_KEY,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry),
          }
        );
      }

      // Option B: Send to LogRocket
      if (process.env.LOGROCKET_APP_ID) {
        // LogRocket backend logging
        await fetch("https://r.lr-ingest.io/i", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...entry,
            sessionURL: `https://app.logrocket.com/${process.env.LOGROCKET_APP_ID}`,
          }),
        });
      }

      // Option C: Send to Custom Analytics
      if (process.env.ANALYTICS_ENDPOINT) {
        await fetch(process.env.ANALYTICS_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.ANALYTICS_API_KEY}`,
          },
          body: JSON.stringify(entry),
        });
      }

      // Option D: Send to Sentry for errors
      if (entry.level === "error" && process.env.SENTRY_DSN) {
        // You'd integrate with @sentry/nextjs here
      }
    } catch (error) {
      // Fallback - don't let logging errors break the app
      console.error("Failed to send logs to external service:", error);
    }
  }
}

const logger = new Logger();

export async function loggingMiddleware(
  request: NextRequest
): Promise<NextResponse | null> {
  const requestId = crypto.randomUUID();

  // Extract request information
  const requestData = {
    requestId,
    method: request.method,
    url: request.nextUrl.pathname + request.nextUrl.search,
    ip:
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown",
    userAgent: request.headers.get("user-agent") || undefined,
  };

  // Only log in development to reduce overhead
  if (process.env.NODE_ENV === 'development') {
    logger.info("Middleware request started", requestData);
  }

  return null;
}
