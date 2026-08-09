package middleware

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/gin-gonic/gin"
)

func TestStaticCacheControl(t *testing.T) {
	gin.SetMode(gin.TestMode)
	files := fstest.MapFS{
		"index.html":           &fstest.MapFile{Data: []byte("index")},
		"sw.js":                &fstest.MapFile{Data: []byte("sw")},
		"manifest.json":        &fstest.MapFile{Data: []byte("manifest")},
		"logo.svg":             &fstest.MapFile{Data: []byte("logo")},
		"assets/app-a1b2c3.js": &fstest.MapFile{Data: []byte("asset")},
	}

	tests := []struct {
		path string
		want string
	}{
		{path: "/", want: "no-cache"},
		{path: "/index.html", want: "no-cache"},
		{path: "/sw.js", want: "no-cache"},
		{path: "/manifest.json", want: "no-cache"},
		{path: "/logo.svg", want: "no-cache"},
		{path: "/assets/app-a1b2c3.js", want: "public, max-age=31536000, immutable"},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest(http.MethodGet, tt.path, nil)

			static("/", http.FS(fs.FS(files)))(ctx)

			if got := recorder.Header().Get("Cache-Control"); got != tt.want {
				t.Fatalf("Cache-Control = %q, want %q", got, tt.want)
			}
		})
	}
}
