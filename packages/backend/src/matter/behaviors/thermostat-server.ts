import { ThermostatServer as Base } from "@matter/main/behaviors";
import { Thermostat } from "@matter/main/clusters";
import { HomeAssistantEntityBehavior } from "../custom-behaviors/home-assistant-entity-behavior.js";
import {
  ClimateDeviceAttributes,
  ClimateHvacAction,
  ClimateHvacMode,
  HomeAssistantEntityInformation,
} from "@home-assistant-matter-hub/common";
import { ClusterType } from "@matter/main/types";
import { applyPatchState } from "../../utils/apply-patch-state.js";

const FeaturedBase = Base.with("Heating", "Cooling", "AutoMode");

export class ThermostatServerBase extends FeaturedBase {
  declare state: ThermostatServerBase.State;

  override async initialize() {
    await super.initialize();
    const homeAssistant = await this.agent.load(HomeAssistantEntityBehavior);
    this.update(homeAssistant.entity);
    if (this.features.heating) {
      this.reactTo(
        this.events.occupiedHeatingSetpoint$Changed,
        this.targetTemperatureChanged,
      );
    }
    if (this.features.cooling) {
      this.reactTo(
        this.events.occupiedCoolingSetpoint$Changed,
        this.targetTemperatureChanged,
      );
    }
    this.reactTo(this.events.systemMode$Changed, this.systemModeChanged);
    this.reactTo(homeAssistant.onChange, this.update);
  }

  private update(entity: HomeAssistantEntityInformation) {
    const attributes = entity.state.attributes as ClimateDeviceAttributes;
    const currentTemperature = this.toTemp(attributes.current_temperature);
    const targetTemperature = this.toTemp(attributes.temperature);
    applyPatchState(this.state, {
      localTemperature: currentTemperature ?? null,
      systemMode: this.getSystemMode(attributes.hvac_mode, entity.state.state),
      thermostatRunningState: this.getRunningState(
        attributes.hvac_action,
        entity.state.state,
        currentTemperature,
        targetTemperature,
      ),
      controlSequenceOfOperation:
        this.features.cooling && this.features.heating
          ? Thermostat.ControlSequenceOfOperation.CoolingAndHeating
          : this.features.cooling
            ? Thermostat.ControlSequenceOfOperation.CoolingOnly
            : Thermostat.ControlSequenceOfOperation.HeatingOnly,
      ...(this.features.heating
        ? {
            occupiedHeatingSetpoint: targetTemperature ?? 20_00,
            minHeatSetpointLimit: this.toTemp(attributes.min_temp),
            maxHeatSetpointLimit: this.toTemp(attributes.max_temp),
            absMinHeatSetpointLimit: this.toTemp(attributes.min_temp),
            absMaxHeatSetpointLimit: this.toTemp(attributes.max_temp),
          }
        : {}),
      ...(this.features.cooling
        ? {
            occupiedCoolingSetpoint: targetTemperature ?? 20_00,
            minCoolSetpointLimit: this.toTemp(attributes.min_temp),
            maxCoolSetpointLimit: this.toTemp(attributes.max_temp),
            absMinCoolSetpointLimit: this.toTemp(attributes.min_temp),
            absMaxCoolSetpointLimit: this.toTemp(attributes.max_temp),
          }
        : {}),
      ...(this.features.autoMode
        ? {
            thermostatRunningMode: this.getRunningMode(
              attributes.hvac_action,
              entity.state.state,
              currentTemperature,
              targetTemperature,
            ),
            minSetpointDeadBand: 0,
          }
        : {}),
    });
  }

  override async setpointRaiseLower(
    request: Thermostat.SetpointRaiseLowerRequest,
  ) {
    const targetTemperature: number | undefined =
      this.state.occupiedCoolingSetpoint ?? this.state.occupiedHeatingSetpoint;
    if (targetTemperature == undefined) {
      return;
    }
    const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
    const temperature = targetTemperature / 100 + request.amount / 10;
    await homeAssistant.callAction(
      "climate",
      "set_temperature",
      { temperature },
      { entity_id: homeAssistant.entityId },
    );
  }

  private async targetTemperatureChanged(value: number) {
    const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
    const entityState = homeAssistant.entity.state.state;
    if (entityState == "off" || entityState == "unavailable") {
      return;
    }
    const currentAttributes = homeAssistant.entity.state
      .attributes as ClimateDeviceAttributes;
    const current = this.toTemp(currentAttributes.temperature);
    if (value === current) {
      return;
    }
    await homeAssistant.callAction(
      "climate",
      "set_temperature",
      { temperature: value / 100 },
      { entity_id: homeAssistant.entityId },
    );
  }

  private async systemModeChanged(systemMode: Thermostat.SystemMode) {
    const homeAssistant = this.agent.get(HomeAssistantEntityBehavior);
    const currentAttributes = homeAssistant.entity.state
      .attributes as ClimateDeviceAttributes;
    const current = this.getSystemMode(
      currentAttributes.hvac_mode,
      homeAssistant.entity.state.state,
    );
    if (systemMode === current) {
      return;
    }
    await homeAssistant.callAction(
      "climate",
      "set_hvac_mode",
      { hvac_mode: this.getHvacMode(systemMode) },
      { entity_id: homeAssistant.entityId },
    );
  }

  private getSystemMode(
    hvacMode: ClimateHvacMode | undefined,
    state: string | ClimateHvacMode,
  ): Thermostat.SystemMode {
    switch (hvacMode ?? state) {
      case ClimateHvacMode.heat:
        return Thermostat.SystemMode.Heat;
      case ClimateHvacMode.cool:
        return Thermostat.SystemMode.Cool;
      case ClimateHvacMode.heat_cool:
      case ClimateHvacMode.auto:
        return Thermostat.SystemMode.Auto;
      case ClimateHvacMode.dry:
        return Thermostat.SystemMode.Dry;
      case ClimateHvacMode.fan_only:
        return Thermostat.SystemMode.FanOnly;
      case ClimateHvacMode.off:
        return Thermostat.SystemMode.Off;
    }
    if (state === "unavailable") {
      return Thermostat.SystemMode.Sleep;
    }
    return Thermostat.SystemMode.Off;
  }

  private getRunningMode(
    hvacAction: ClimateHvacAction | undefined,
    state: string | ClimateHvacMode,
    currentTemperature: number | undefined,
    targetTemperature: number | undefined,
  ): Thermostat.ThermostatRunningMode {
    switch (hvacAction ?? state) {
      case ClimateHvacAction.preheating:
      case ClimateHvacAction.defrosting:
      case ClimateHvacAction.heating:
      case ClimateHvacAction.drying:
      case ClimateHvacMode.heat:
      case ClimateHvacMode.dry:
        return Thermostat.ThermostatRunningMode.Heat;
      case ClimateHvacAction.cooling:
      case ClimateHvacMode.cool:
        return Thermostat.ThermostatRunningMode.Cool;
      case ClimateHvacAction.fan:
      case ClimateHvacAction.idle:
      case ClimateHvacAction.off:
      case ClimateHvacMode.fan_only:
      case ClimateHvacMode.off:
        return Thermostat.ThermostatRunningMode.Off;
      case ClimateHvacMode.heat_cool:
      case ClimateHvacMode.auto:
        return currentTemperature == undefined ||
          targetTemperature == undefined ||
          currentTemperature === targetTemperature
          ? Thermostat.ThermostatRunningMode.Off
          : currentTemperature < targetTemperature
            ? Thermostat.ThermostatRunningMode.Heat
            : Thermostat.ThermostatRunningMode.Cool;
    }
    return Thermostat.ThermostatRunningMode.Off;
  }

  private getRunningState(
    hvacAction: ClimateHvacAction | undefined,
    state: string | ClimateHvacMode,
    currentTemperature: number | undefined,
    targetTemperature: number | undefined,
  ): ThermostatRunningState {
    const allOff: ThermostatRunningState = {
      cool: false,
      fan: false,
      heat: false,
      heatStage2: false,
      coolStage2: false,
      fanStage2: false,
      fanStage3: false,
    };
    switch (hvacAction ?? state) {
      case ClimateHvacAction.preheating:
      case ClimateHvacAction.defrosting:
      case ClimateHvacAction.heating:
      case ClimateHvacMode.heat:
        return { ...allOff, heat: true };
      case ClimateHvacAction.cooling:
      case ClimateHvacMode.cool:
        return { ...allOff, cool: true };
      case ClimateHvacAction.drying:
      case ClimateHvacMode.dry:
        return { ...allOff, heat: true, fan: true };
      case ClimateHvacMode.fan_only:
      case ClimateHvacAction.fan:
        return { ...allOff, fan: true };
      case ClimateHvacAction.idle:
      case ClimateHvacAction.off:
      case ClimateHvacMode.off:
        return allOff;
      case ClimateHvacMode.heat_cool:
      case ClimateHvacMode.auto:
        return currentTemperature == undefined ||
          targetTemperature == undefined ||
          currentTemperature === targetTemperature
          ? allOff
          : currentTemperature < targetTemperature
            ? { ...allOff, heat: true }
            : { ...allOff, cool: true };
    }
    return allOff;
  }

  private getHvacMode(systemMode: Thermostat.SystemMode): ClimateHvacMode {
    switch (systemMode) {
      case Thermostat.SystemMode.Auto:
        return ClimateHvacMode.auto;
      case Thermostat.SystemMode.Precooling:
      case Thermostat.SystemMode.Cool:
        return ClimateHvacMode.cool;
      case Thermostat.SystemMode.Heat:
      case Thermostat.SystemMode.EmergencyHeat:
        return ClimateHvacMode.heat;
      case Thermostat.SystemMode.FanOnly:
        return ClimateHvacMode.fan_only;
      case Thermostat.SystemMode.Dry:
        return ClimateHvacMode.dry;
      case Thermostat.SystemMode.Sleep:
      case Thermostat.SystemMode.Off:
        return ClimateHvacMode.off;
    }
  }

  private toTemp(
    value: number | string | null | undefined,
  ): number | undefined {
    const current = value != null ? +value : null;
    if (current == null || isNaN(current)) {
      return undefined;
    } else {
      return current * 100;
    }
  }
}

export namespace ThermostatServerBase {
  export class State extends FeaturedBase.State {}
}

export class ThermostatServer extends ThermostatServerBase.for(
  ClusterType(Thermostat.Base),
) {}

interface ThermostatRunningState {
  heat: boolean;
  cool: boolean;
  fan: boolean;
  heatStage2: false;
  coolStage2: false;
  fanStage2: false;
  fanStage3: false;
}
