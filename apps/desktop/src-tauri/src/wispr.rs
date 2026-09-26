//! Диктовка через Wispr Flow: кнопка «Диктовать» нажимает за пользователя
//! сочетание клавиш Wispr Flow для записи без удержания (hands-free).
//! Сочетания по умолчанию — из справки Wispr Flow:
//! https://docs.wisprflow.ai/articles/2612050838-supported-unsupported-keyboard-hotkey-shortcuts
//! Windows: Ctrl + Win + Space; macOS: Fn + Space.
//! Текст вставляет сам Wispr Flow в поле, где стоит курсор.

use serde::Serialize;

#[derive(Serialize, Debug, PartialEq, Eq)]
#[cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    /// Сочетание отправлено: запись включает Wispr Flow.
    Sent,
    /// macOS: нужно разрешение «Универсальный доступ», иначе система не пропустит нажатия.
    NeedsPermission,
    /// Здесь сочетание не отправляется (Android — кнопка Wispr над клавиатурой, Linux — Wispr Flow нет).
    Unsupported,
}

#[cfg(windows)]
pub fn start() -> Result<Outcome, String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VK_CONTROL,
        VK_LWIN, VK_SPACE,
    };
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
    let inputs = [
        key(VK_CONTROL, false),
        key(VK_LWIN, false),
        key(VK_SPACE, false),
        key(VK_SPACE, true),
        key(VK_LWIN, true),
        key(VK_CONTROL, true),
    ];
    // SAFETY: массив INPUT живёт до конца вызова, размер структуры передан верно.
    let sent = unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32) };
    if sent as usize == inputs.len() {
        Ok(Outcome::Sent)
    } else {
        Err("Windows не приняла нажатие клавиш".into())
    }
}

#[cfg(target_os = "macos")]
pub fn start() -> Result<Outcome, String> {
    use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation, CGEventType};
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

    if !accessibility_trusted() {
        return Ok(Outcome::NeedsPermission);
    }
    const FN: u16 = 63; // kVK_Function
    const SPACE: u16 = 49; // kVK_Space
    let source = CGEventSource::new(CGEventSourceStateID::HIDSystemState).map_err(|_| "Нет источника событий")?;
    let event = |code: u16, down: bool, flags: CGEventFlags, flags_changed: bool| -> Result<CGEvent, String> {
        let e = CGEvent::new_keyboard_event(source.clone(), code, down).map_err(|_| "Не удалось создать нажатие")?;
        e.set_flags(flags);
        if flags_changed {
            e.set_type(CGEventType::FlagsChanged);
        }
        Ok(e)
    };
    let with_fn = CGEventFlags::CGEventFlagSecondaryFn;
    for e in [
        event(FN, true, with_fn, true)?,
        event(SPACE, true, with_fn, false)?,
        event(SPACE, false, with_fn, false)?,
        event(FN, false, CGEventFlags::CGEventFlagNull, true)?,
    ] {
        e.post(CGEventTapLocation::HID);
    }
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
pub fn start() -> Result<Outcome, String> {
    Ok(Outcome::Unsupported)
}
