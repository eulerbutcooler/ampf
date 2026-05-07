---
title: "Building reliable workflows with NATS and Go"
description: "How I use NATS JetStream as the backbone of durable workflow execution in production, and why it beats Kafka for this use-case."
date: "2026-05-04"
tag: "Systems"
---

NATS JetStream changed how I think about distributed workflow execution. This is what I learned shipping it in production.

## The problem with polling

Every workflow engine eventually hits the same wall: polling is cheap to build but expensive to run at scale. You end up with a thundering herd of goroutines sleeping on `time.Sleep`, wasting CPU cycles checking for work that isn't there.

```go
// The naive way — don't do this
for {
    jobs, err := db.GetPendingJobs(ctx)
    if err != nil {
        log.Error(err)
    }
    for _, job := range jobs {
        go process(job)
    }
    time.Sleep(500 * time.Millisecond)
}
```

The problem compounds when you add retries, dead-letter queues, and back-pressure. What started as 50 lines becomes a mini-broker.

## Why NATS JetStream

JetStream gives you persistent, at-least-once delivery with consumer groups out of the box. The mental model is simple:

- **Stream** — an ordered, persistent log of messages
- **Consumer** — a cursor into that stream, with its own delivery semantics

```go
js, _ := nc.JetStream()

// Create a stream once
js.AddStream(&nats.StreamConfig{
    Name:     "WORKFLOWS",
    Subjects: []string{"workflow.>"},
    Storage:  nats.FileStorage,
})

// Subscribe with a durable consumer
sub, _ := js.Subscribe("workflow.run", func(msg *nats.Msg) {
    var job Job
    json.Unmarshal(msg.Data, &job)

    if err := process(job); err != nil {
        msg.Nak() // requeue with backoff
        return
    }
    msg.Ack()
}, nats.Durable("worker"), nats.ManualAck())
```

## Backoff and retries

JetStream supports `NakWithDelay` for exponential backoff without any extra infrastructure:

```go
attempt := msg.Metadata().NumDelivered
delay := time.Duration(math.Pow(2, float64(attempt))) * time.Second
msg.NakWithDelay(delay)
```

After a configurable `MaxDeliver`, messages land in a dead-letter stream automatically.

## What I'd do differently

If I were starting over, I'd define a proper `WorkflowStep` interface earlier and keep NATS as a pure transport layer — not let job-specific logic leak into the subscriber. The boundary matters.

---

This is one post in an ongoing series on building Iris, my workflow automation platform.
