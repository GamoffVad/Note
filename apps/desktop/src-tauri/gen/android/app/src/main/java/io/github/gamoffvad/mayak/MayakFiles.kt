package io.github.gamoffvad.mayak

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity

/**
 * Вкладка «Файлы» на телефоне: сохранение полученного файла системным
 * «Диспетчером загрузок» по временной подписанной ссылке хранилища Supabase.
 * Файл попадает в «Загрузки», система показывает уведомление с кнопкой
 * открытия. Разрешения не нужны (Android 10+); на старых версиях файл
 * сохраняется в папку загрузок приложения.
 * https://developer.android.com/reference/android/app/DownloadManager
 */
class MayakFiles(private val activity: AppCompatActivity) {
    fun attach(view: WebView) {
        view.addJavascriptInterface(Bridge(), "MayakFiles")
    }

    inner class Bridge {
        /** Ставит файл в очередь загрузки; false — ссылка не из хранилища Supabase. */
        @JavascriptInterface
        fun download(url: String, name: String, mime: String): Boolean {
            val uri = Uri.parse(url)
            val host = uri.host.orEmpty()
            if (uri.scheme != "https" || !host.endsWith(".supabase.co") ||
                uri.path?.startsWith("/storage/v1/object/sign/transfers/") != true
            ) {
                return false
            }
            val file = name.replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").trim().trim('.').ifEmpty { "Файл" }
            val request = DownloadManager.Request(uri)
                .setTitle(file)
                .setMimeType(mime.ifEmpty { "application/octet-stream" })
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, file)
            } else {
                request.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, file)
            }
            val manager = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            manager.enqueue(request)
            return true
        }
    }
}
