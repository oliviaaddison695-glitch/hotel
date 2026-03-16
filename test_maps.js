const mockMap = {};
class AdvancedMarkerElement {
  constructor(options) {
    this.map = options.map;
    this.position = options.position;
    this.content = options.content;
    this.title = options.title;
    this.gmpClickable = options.gmpClickable;
    this.zIndex = options.zIndex;
    this.collisionBehavior = options.collisionBehavior;
  }
  addListener(event, fn) { }
}

const map = undefined; // What if map is undefined?
// new AdvancedMarkerElement({ map, position: {lat:0,lng:0}, content: document.createElement('div') });
