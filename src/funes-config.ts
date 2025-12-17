import { Events } from "./events";
import { Color } from "playcanvas";

const loadConfig = async (events: Events) => {
  events.fire("grid.setVisible", false);
  events.fire("camera.toggleOverlay");
  events.fire("bottomToolbar.setVisible", false);
  events.fire("rightToolbar.setVisible", false);
  events.fire("modeToggle.setVisible", false);
  events.fire("menuBar.setVisible", false);
  events.fire("appLabel.setVisible", false);
  events.fire("viewCube.setVisible", false);
  events.fire("timelinePanel.setVisible", false);
  events.fire("dataPanel.setVisible", false);
  events.fire("scenePanel.setVisible", false);
};

export { loadConfig };
