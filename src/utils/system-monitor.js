/**
 * System Monitor — CPU & GPU monitoring for Electron main process
 * Uses systeminformation (source: npm package, verified API)
 */

const si = require('systeminformation');

class SystemMonitor {
  constructor() {
    this._interval = null;
    this._pollMs = 1000;
    this._listeners = [];
    this._gpuLoadHistory = [];
    this._cpuLoadHistory = [];
    this._maxHistory = 60;
  }

  /**
   * Get current CPU load (0-100%)
   * Source: systeminformation.currentLoad() — returns avgLoad, currentLoad
   */
  async getCpuLoad() {
    try {
      const data = await si.currentLoad();
      return {
        load: Math.round(data.currentLoad * 10) / 10,
        avgLoad: data.avgLoad,
        cores: data.cpus ? data.cpus.map(c => Math.round(c.load * 10) / 10) : []
      };
    } catch (e) {
      return { load: 0, avgLoad: 0, cores: [], error: e.message };
    }
  }

  /**
   * Get GPU information
   * Source: systeminformation.graphics() — returns controllers[], displays[]
   */
  async getGpuInfo() {
    try {
      const data = await si.graphics();
      const controllers = data.controllers || [];
      const result = {
        gpus: controllers.map(c => ({
          model: c.model || 'Unknown',
          vendor: c.vendor || 'Unknown',
          vram: c.vram || 0,
          vramDynamic: c.vramDynamic || false
        })),
        displays: (data.displays || []).map(d => ({
          model: d.model || 'Unknown',
          resolution: `${d.resolutionX || 0}x${d.resolutionY || 0}`,
          currentRes: `${d.currentResX || 0}x${d.currentResY || 0}`
        }))
      };
      return result;
    } catch (e) {
      return { gpus: [], displays: [], error: e.message };
    }
  }

  /**
   * Get combined stats snapshot
   */
  async getSnapshot() {
    const [cpu, gpu] = await Promise.all([
      this.getCpuLoad(),
      this.getGpuInfo()
    ]);
    return {
      timestamp: Date.now(),
      cpu,
      gpu
    };
  }

  /**
   * Start periodic monitoring
   */
  start(onUpdate, pollMs = 1000) {
    this._pollMs = pollMs;
    if (onUpdate) this._listeners.push(onUpdate);
    if (this._interval) return;

    this._interval = setInterval(async () => {
      const snapshot = await this.getSnapshot();
      this._cpuLoadHistory.push(snapshot.cpu.load);
      if (this._cpuLoadHistory.length > this._maxHistory) {
        this._cpuLoadHistory.shift();
      }
      for (const cb of this._listeners) {
        try { cb(snapshot); } catch (e) {}
      }
    }, this._pollMs);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  getHistory() {
    return {
      cpu: [...this._cpuLoadHistory],
      maxHistory: this._maxHistory
    };
  }

  /**
   * Check if dedicated GPU is present (vs integrated)
   * Returns true if a discrete GPU with >0 vram is found
   */
  async hasDedicatedGpu() {
    try {
      const data = await si.graphics();
      const controllers = data.controllers || [];
      return controllers.some(c => c.vram > 0 && !c.vramDynamic);
    } catch (e) {
      return false;
    }
  }

  destroy() {
    this.stop();
    this._listeners = [];
    this._cpuLoadHistory = [];
    this._gpuLoadHistory = [];
  }
}

module.exports = { SystemMonitor };
