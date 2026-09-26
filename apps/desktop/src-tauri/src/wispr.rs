//! Диктовка через Wispr Flow удержанием: пока нажата кнопка «Диктовать»,
//! приложение держит нажатым сочетание Wispr Flow для записи с удержанием
//! (push-to-talk); отпустили кнопку — отпускаются и клавиши, Wispr Flow
//! вставляет распознанный текст в поле, где стоит курсор.
//! Сочетания по умолчанию — из справки Wispr Flow:
//! https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts
//! Windows: Ctrl + Win; macOS: Fn.

use serde::Serialize;

#[derive(Serialize, Debug, PartialEq, Eq)]
#[cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    /// Нажатие (или отпускание) отправлено.
    Sent,
    /// macOS: нужно разрешение «Универсальный доступ», иначе система не пропустит нажатия.
    NeedsPermission,
    /// Здесь сочетание не отправляется (Linux — Wispr Flow нет).
    Unsupported,
}

#[cfg(windows)]
pub fn press(down: bool) -> Result<Outcome, String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VK_CONTROL,
        VK_LWIN,
    };
    /// Неназначенная клавиша: нажатие перед отпусканием Win не даёт открыться меню «Пуск».
    const VK_MASK: u16 = 0xE8;
    fn key(vk: u16, up: bool) -> INPUT {
        let mut flags = if up { KEYEVENTF_KEYUP } else { 0 };
        if vk == VK_LWIN {
            flags |= KEYEVENTF_EXTENDEDKEY;
        }
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
        }
    }
    let inputs: Vec<INPUT> = if down {
        vec![key(VK_CONTROL, false), key(VK_LWIN, false)]
    } else {
        vec![key(VK_MASK, false), key(VK_MASK, true), key(VK_LWIN, true), key(VK_CONTROL, true)]
    };
    // SAFETY: массив INPUT живёт до конца вызова, размер структуры передан верно.
    let sent = unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32) };
    if sent as usize == inputs.len() {
        Ok(Outcome::Sent)
    } else {
        Err("Windows не приняла нажатие клавиш".into())
    }
}

#[cfg(target_os = "macos")]
pub fn press(down: bool) -> Result<Outcome, String> {
    use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation, CGEventType};
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

    // Отпускание отправляем всегда: клавиша не должна «залипнуть».
    if down && !accessibility_trusted() {
        return Ok(Outcome::NeedsPermission);
    }
    const FN: u16 = 63; // kVK_Function
    let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState).map_err(|_| "Нет источника событий")?;
    let event = CGEvent::new_keyboard_event(source, FN, down).map_err(|_| "Не удалось создать нажатие")?;
    event.set_type(CGEventType::FlagsChanged);
    event.set_flags(if down { CGEventFlags::CGEventFlagSecondaryFn } else { CGEventFlags::CGEventFlagNull });
    event.post(CGEventTapLocation::HID);
    Ok(Outcome::Sent)
}

/// Разрешение «Универсальный доступ»; при первом отказе macOS сама показывает запрос.
#[cfg(target_os = "macos")]
fn accessibility_trusted() -> bool {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::string::{CFString, CFStringRef};

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        static kAXTrustedCheckOptionPrompt: CFStringRef;
        fn AXIsProcessTrustedWithOptions(options: core_foundation::dictionary::CFDictionaryRef) -> bool;
    }
    // SAFETY: константа и функция из ApplicationServices; словарь живёт до конца вызова.
    unsafe {
        let key = CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt);
        let options = CFDictionary::from_CFType_pairs(&[(key, CFBoolean::true_value())]);
        AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef())
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
pub fn press(_down: bool) -> Result<Outcome, String> {
    Ok(Outcome::Unsupported)
}
