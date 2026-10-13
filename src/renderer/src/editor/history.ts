export class History {
  private values: string[] = [];
  private index = -1;

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.values.length - 1;
  }

  reset(value: string) {
    this.values = [value];
    this.index = 0;
  }

  push(value: string) {
    if (!value || value === this.values[this.index]) return;
    this.values = this.values.slice(0, this.index + 1);
    this.values.push(value);
    this.index++;
  }

  undo() {
    if (!this.canUndo) return null;
    return this.values[--this.index];
  }

  redo() {
    if (!this.canRedo) return null;
    return this.values[++this.index];
  }
}
