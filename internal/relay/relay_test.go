package relay

import (
	"encoding/json"
	"net/http"
	"testing"

	dbmodel "github.com/bestruirui/octopus/internal/model"
	"github.com/looplj/axonhub/llm"
	"github.com/looplj/axonhub/llm/httpclient"
)

func TestApplyChannelRequestOptionsPreservesSameFormatBody(t *testing.T) {
	rawBody := []byte(`{"model":"requested-model","max_tokens":1024,"messages":[{"role":"user","content":"hello"}],"context_management":{"edits":[{"type":"clear_tool_uses_20250919"}]},"future_field":{"enabled":true}}`)
	attempt := &relayAttempt{
		relayRun: &relayRun{
			internalRequest: &llm.Request{
				Model:     "mapped-model",
				APIFormat: llm.APIFormatAnthropicMessage,
				RawRequest: &httpclient.Request{
					Body: rawBody,
				},
			},
			metrics: &RelayMetrics{},
		},
		channel: &dbmodel.Channel{Type: llm.APIFormatAnthropicMessage},
	}
	outbound := &httpclient.Request{
		APIFormat: string(llm.APIFormatAnthropicMessage),
		Headers:   http.Header{"Content-Type": []string{"application/json"}},
		Body:      []byte(`{"model":"requested-model","max_tokens":1024,"messages":[{"role":"user","content":"hello"}]}`),
	}

	attempt.applyChannelRequestOptions(outbound)

	var body map[string]any
	if err := json.Unmarshal(outbound.Body, &body); err != nil {
		t.Fatalf("decode outbound body: %v", err)
	}
	if body["model"] != "mapped-model" {
		t.Fatalf("model = %v, want mapped-model", body["model"])
	}
	if _, ok := body["context_management"]; !ok {
		t.Fatal("context_management was dropped")
	}
	if _, ok := body["future_field"]; !ok {
		t.Fatal("unknown same-format field was dropped")
	}
}

func TestApplyChannelRequestOptionsKeepsTransformedBodyAcrossFormats(t *testing.T) {
	rawBody := []byte(`{"model":"requested-model","anthropic_only":true}`)
	transformedBody := []byte(`{"model":"mapped-model","messages":[{"role":"user","content":"hello"}]}`)
	attempt := &relayAttempt{
		relayRun: &relayRun{
			internalRequest: &llm.Request{
				Model:     "mapped-model",
				APIFormat: llm.APIFormatAnthropicMessage,
				RawRequest: &httpclient.Request{
					Body: rawBody,
				},
			},
			metrics: &RelayMetrics{},
		},
		channel: &dbmodel.Channel{Type: llm.APIFormatOpenAIChatCompletion},
	}
	outbound := &httpclient.Request{
		APIFormat: string(llm.APIFormatOpenAIChatCompletion),
		Headers:   http.Header{"Content-Type": []string{"application/json"}},
		Body:      transformedBody,
	}

	attempt.applyChannelRequestOptions(outbound)

	if string(outbound.Body) != string(transformedBody) {
		t.Fatalf("cross-format body changed to %s", outbound.Body)
	}
}
