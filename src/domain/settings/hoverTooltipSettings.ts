import { hoverTooltipEnabledItem } from "../../storage/items";

export async function loadHoverTooltipSetting(): Promise<boolean> {
  return (await hoverTooltipEnabledItem.getValue()) !== false;
}

export async function persistHoverTooltipSetting(enabled: boolean): Promise<void> {
  await hoverTooltipEnabledItem.setValue(enabled !== false);
}
