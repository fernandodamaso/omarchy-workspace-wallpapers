import Quickshell.Io
import QtQuick

Item {
  required property var controller

  IpcHandler {
    target: "background"

    function refresh(): void {
      controller.refreshBackground()
    }

    function set(path: string): void {
      controller.setNativeBackground(path, false)
    }

    function setInstant(path: string): void {
      controller.setNativeBackground(path, true)
    }

    function transition(fromPath: string, path: string): void {
      controller.transitionNativeBackground(fromPath, path)
    }

    function themeTransition(fromPath: string, path: string, finalPath: string, colorsB64: string, shellB64: string): void {
      controller.themeTransitionNative(fromPath, path, finalPath, colorsB64, shellB64)
    }
  }
}
