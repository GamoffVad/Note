package io.github.gamoffvad.mayak

import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  // Диктовка встроенным распознаванием Android (MayakSpeech.kt).
  private val speech = MayakSpeech(this)

  override fun onWebViewCreate(webView: WebView) {
    speech.attach(webView)
  }

  override fun onPause() {
    speech.pause()
    super.onPause()
  }

  override fun onDestroy() {
    speech.destroy()
    super.onDestroy()
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Интерфейс не должен заходить под строку состояния, вырез камеры,
    // скругления экрана, панель навигации и клавиатуру: отступы задаёт система.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
      WindowInsetsCompat.CONSUMED
    }
  }
}
