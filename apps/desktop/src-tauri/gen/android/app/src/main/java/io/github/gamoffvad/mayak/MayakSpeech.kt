package io.github.gamoffvad.mayak

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * Диктовка на телефоне встроенным распознаванием Android (SpeechRecognizer):
 * https://developer.android.com/reference/android/speech/SpeechRecognizer
 *
 * Интерфейс вызывает window.MayakSpeech.start()/stop(); события приходят в
 * window.__mayakSpeech(json): частичный текст по мере речи, итог фразы,
 * состояние записи и ошибки. Запись идёт, пока пользователь не нажмёт
 * «Остановить»: после паузы в речи распознавание перезапускается.
 * Звук приложение не сохраняет.
 */
class MayakSpeech(private val activity: AppCompatActivity) {
    private var webView: WebView? = null
    private var recognizer: SpeechRecognizer? = null
    /** Пользователь не нажал «Остановить»: после паузы слушаем дальше. */
    private var active = false

    // Регистрируется при создании активности — так требует Activity Result API.
    private val permission =
        activity.registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) listen() else fail("permission")
        }

    fun attach(view: WebView) {
        webView = view
        view.addJavascriptInterface(Bridge(), "MayakSpeech")
    }

    /** Приложение ушло в фон: запись останавливается, скрытой записи нет. */
    fun pause() {
        if (!active) return
        active = false
        recognizer?.cancel()
        finish()
    }

    fun destroy() {
        active = false
        recognizer?.destroy()
        recognizer = null
    }

    inner class Bridge {
        @JavascriptInterface
        fun available(): Boolean = SpeechRecognizer.isRecognitionAvailable(activity)

        @JavascriptInterface
        fun start() = activity.runOnUiThread { begin() }

        @JavascriptInterface
        fun stop() = activity.runOnUiThread {
            active = false
            recognizer?.stopListening()
        }
    }

    private fun begin() {
        if (!SpeechRecognizer.isRecognitionAvailable(activity)) return fail("unavailable")
        active = true
        val granted = ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) listen() else permission.launch(Manifest.permission.RECORD_AUDIO)
    }

    private fun listen() {
        if (!active) return
        val current = recognizer ?: SpeechRecognizer.createSpeechRecognizer(activity).also {
            it.setRecognitionListener(Listener())
            recognizer = it
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, activity.packageName)
        }
        current.startListening(intent)
        emit(JSONObject().put("type", "listening").put("value", true))
    }

    private fun finish() {
        active = false
        emit(JSONObject().put("type", "listening").put("value", false))
    }

    private fun fail(code: String) {
        active = false
        recognizer?.cancel()
        emit(JSONObject().put("type", "error").put("code", code))
        emit(JSONObject().put("type", "listening").put("value", false))
    }

    private fun emit(event: JSONObject) {
        val view = webView ?: return
        val json = JSONObject.quote(event.toString())
        view.post { view.evaluateJavascript("window.__mayakSpeech && window.__mayakSpeech($json)", null) }
    }

    private fun best(results: Bundle?): String =
        results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()

    private inner class Listener : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}

        override fun onPartialResults(partialResults: Bundle?) {
            val text = best(partialResults)
            if (text.isNotEmpty()) emit(JSONObject().put("type", "partial").put("text", text))
        }

        override fun onResults(results: Bundle?) {
            val text = best(results)
            if (text.isNotEmpty()) emit(JSONObject().put("type", "final").put("text", text))
            if (active) listen() else finish()
        }

        override fun onError(error: Int) {
            when (error) {
                // Пауза в речи или ничего не распознано — слушаем дальше, пока не нажали «Остановить».
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT ->
                    if (active) listen() else finish()
                // Сразу после «Остановить» система может сообщить об отмене — это не ошибка.
                SpeechRecognizer.ERROR_CLIENT -> if (active) fail("client") else finish()
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> {
                    recognizer?.destroy()
                    recognizer = null
                    if (active) listen() else finish()
                }
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> fail("permission")
                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
                SpeechRecognizer.ERROR_SERVER -> fail("network")
                SpeechRecognizer.ERROR_AUDIO -> fail("audio")
                else -> fail("error-$error")
            }
        }
    }
}
