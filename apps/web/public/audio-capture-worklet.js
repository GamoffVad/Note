// Маяк · запись с микрофона для диктовки: передаёт отсчёты первого канала
// в основной поток порциями. Файл лежит отдельно, потому что CSP разрешает
// только собственные скрипты.
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("mayak-capture", CaptureProcessor);
