{{- define "kennste.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "kennste.fullname" -}}
{{- if contains .Chart.Name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "kennste.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{ include "kennste.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "kennste.selectorLabels" -}}
app.kubernetes.io/name: {{ include "kennste.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* The Secret with the Spotify credentials and the session secret: the chart's own or an existing one */}}
{{- define "kennste.secretName" -}}
{{- .Values.existingSecret | default (include "kennste.fullname" .) }}
{{- end }}

{{/* Host part of .Values.url, for the ingress */}}
{{- define "kennste.host" -}}
{{- .Values.ingress.host | default (regexReplaceAll "^https?://([^/:]+).*$" .Values.url "${1}") }}
{{- end }}
