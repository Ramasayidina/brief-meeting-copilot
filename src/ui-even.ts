// ---------------------------------------------------------------------------
// EvenHubUI — drives Brief on real G2 glasses and in the Even Hub simulator
// through the official @evenrealities/even_hub_sdk bridge.
//
// Mapping to the SDK:
//   showPage(first)  → createStartUpPageContainer
//   showPage(rest)   → rebuildPageContainer
//   setText          → textContainerUpgrade
//   exit             → shutDownPageContainer(1)  (system confirm dialog —
//                      mode 0 silent exit is rejected in Even Hub QA)
//   gestures         ← onEvenHubEvent (textEvent / listEvent / sysEvent)
// ---------------------------------------------------------------------------

import {
  CreateStartUpPageContainer,
  ListContainerProperty,
  ListItemContainerProperty,
  OsEventTypeList,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import type { ContainerBox, Gesture, GestureEvent, GlassesUI, Page } from './types'

export class EvenHubUI implements GlassesUI {
  readonly driverName = 'Even Hub SDK (glasses / simulator)'

  constructor(private bridge: EvenAppBridge) {}

  async showPage(page: Page, first: boolean): Promise<void> {
    const textObject: TextContainerProperty[] = []
    const listObject: ListContainerProperty[] = []

    for (const c of page.containers) {
      if (c.kind === 'text') {
        textObject.push(
          new TextContainerProperty({
            xPosition: c.x,
            yPosition: c.y,
            width: c.w,
            height: c.h,
            borderWidth: c.bordered ? 1 : 0,
            borderColor: 5,
            paddingLength: 6,
            containerID: c.id,
            containerName: c.name,
            content: c.content,
            isEventCapture: c.capture ? 1 : 0,
          }),
        )
      } else {
        listObject.push(
          new ListContainerProperty({
            xPosition: c.x,
            yPosition: c.y,
            width: c.w,
            height: c.h,
            borderWidth: 1,
            borderColor: 5,
            paddingLength: 6,
            containerID: c.id,
            containerName: c.name,
            isEventCapture: c.capture ? 1 : 0,
            itemContainer: new ListItemContainerProperty({
              itemCount: c.items.length,
              itemWidth: c.w - 12,
              isItemSelectBorderEn: 1,
              itemName: c.items,
            }),
          }),
        )
      }
    }

    const total = textObject.length + listObject.length
    if (first) {
      const result = await this.bridge.createStartUpPageContainer(
        new CreateStartUpPageContainer({
          containerTotalNum: total,
          textObject,
          listObject,
        }),
      )
      // 0.0.x returns a result object (older docs show a bare int code).
      const code =
        typeof result === 'number' ? result : ((result as { code?: number })?.code ?? 0)
      if (code !== 0) console.error('createStartUpPageContainer failed:', result)
    } else {
      await this.bridge.rebuildPageContainer(
        new RebuildPageContainer({
          containerTotalNum: total,
          textObject,
          listObject,
        }),
      )
    }
  }

  async setText(name: string, content: string): Promise<void> {
    // The body container is always ID 1 in Brief's layout.
    await this.bridge.textContainerUpgrade(
      new TextContainerUpgrade({ containerID: 1, containerName: name, content }),
    )
  }

  onGesture(cb: (ev: GestureEvent) => void): void {
    this.bridge.onEvenHubEvent((event: EvenHubEvent) => {
      const gesture = mapEvent(event)
      if (gesture) cb(gesture)
    })
  }

  async exit(): Promise<void> {
    await this.bridge.shutDownPageContainer(1)
  }
}

/** Normalise the three SDK event channels into one GestureEvent. */
function mapEvent(event: EvenHubEvent): GestureEvent | null {
  // Long-press arrives on sysEvent; list interactions on listEvent (they
  // carry the highlighted item); everything else on textEvent.
  const src = event.listEvent ?? event.textEvent ?? event.sysEvent
  if (!src) return null

  // SDK quirk: CLICK_EVENT is 0, which some paths normalise to undefined.
  const raw = src.eventType as OsEventTypeList | undefined
  const type = raw === undefined ? OsEventTypeList.CLICK_EVENT : raw

  const selectIndex =
    event.listEvent?.currentSelectItemIndex !== undefined
      ? Number(event.listEvent.currentSelectItemIndex)
      : undefined

  const gesture: Gesture | null =
    type === OsEventTypeList.CLICK_EVENT
      ? 'tap'
      : type === OsEventTypeList.DOUBLE_CLICK_EVENT
        ? 'double'
        : type === OsEventTypeList.SCROLL_TOP_EVENT
          ? 'up'
          : type === OsEventTypeList.SCROLL_BOTTOM_EVENT
            ? 'down'
            : type === OsEventTypeList.LONG_PRESS_EVENT
              ? 'hold'
              : null

  return gesture ? { gesture, selectIndex } : null
}

export type { ContainerBox }
