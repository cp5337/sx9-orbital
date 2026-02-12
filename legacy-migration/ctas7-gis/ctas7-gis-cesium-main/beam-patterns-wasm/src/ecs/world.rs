// ECS World manager with WASM bindings
// Module: ecs/world.rs | Lines: ~195 | Tier: Simple (<200)

use wasm_bindgen::prelude::*;
use hecs::World;
use std::collections::HashMap;
use crate::ecs::components::*;

#[wasm_bindgen]
pub struct ECSWorld {
    world: World,
    station_entities: HashMap<String, hecs::Entity>,
}

#[wasm_bindgen]
impl ECSWorld {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        console_log!("Initializing ECS World for beam pattern simulation");
        Self {
            world: World::new(),
            station_entities: HashMap::new(),
        }
    }

    #[wasm_bindgen]
    pub fn add_ground_station(
        &mut self,
        id: String,
        lat: f64,
        lon: f64,
        alt: f64,
        preset: String,
    ) -> Result<(), JsValue> {
        let preset_type = match preset.as_str() {
            "basic" => DeclinationPreset::Basic,
            "operational" => DeclinationPreset::Operational,
            "precision" => DeclinationPreset::Precision,
            _ => DeclinationPreset::Operational,
        };

        let angles = preset_type.default_angles();

        let entity = self.world.spawn((
            GroundStationId(id.clone()),
            GeodeticPosition {
                latitude_deg: lat,
                longitude_deg: lon,
                altitude_m: alt,
            },
            DeclinationAngles {
                angles_deg: angles,
                preset_type,
                custom: false,
            },
            BeamParameters::default(),
            AtmosphericConditions::default(),
            StationMetadata::default(),
        ));

        self.station_entities.insert(id, entity);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn set_declination_angles(
        &mut self,
        station_id: String,
        angles: Vec<f64>,
    ) -> Result<(), JsValue> {
        let entity = self.station_entities
            .get(&station_id)
            .ok_or_else(|| JsValue::from_str("Station not found"))?;

        if angles.len() < 3 || angles.len() > 20 {
            return Err(JsValue::from_str("Must have 3-20 angles"));
        }

        if let Ok(mut declination) = self.world.get::<&mut DeclinationAngles>(*entity) {
            declination.angles_deg = angles;
            declination.custom = true;
            declination.preset_type = DeclinationPreset::Custom;
        }

        Ok(())
    }

    #[wasm_bindgen]
    pub fn get_station_info(&self, station_id: String) -> Result<String, JsValue> {
        let entity = self.station_entities
            .get(&station_id)
            .ok_or_else(|| JsValue::from_str("Station not found"))?;

        let position = self.world.get::<&GeodeticPosition>(*entity)
            .map_err(|_| JsValue::from_str("No position data"))?;

        let angles = self.world.get::<&DeclinationAngles>(*entity)
            .map_err(|_| JsValue::from_str("No declination data"))?;

        let info = serde_json::json!({
            "position": *position,
            "declination": *angles,
        });

        serde_json::to_string_pretty(&info)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen]
    pub fn calculate_link_budgets(&mut self, station_id: String) -> Result<String, JsValue> {
        let entity = self.station_entities
            .get(&station_id)
            .ok_or_else(|| JsValue::from_str("Station not found"))?;

        let angles = self.world.get::<&DeclinationAngles>(*entity)
            .map_err(|_| JsValue::from_str("No angles"))?;

        let conditions = self.world.get::<&AtmosphericConditions>(*entity)
            .map_err(|_| JsValue::from_str("No conditions"))?;

        let budgets: Vec<LinkBudget> = angles.angles_deg
            .iter()
            .map(|&elev| LinkBudget::calculate(elev, &conditions))
            .collect();

        serde_json::to_string(&budgets)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen]
    pub fn update_atmospheric_conditions(
        &mut self,
        station_id: String,
        cn2: f64,
        visibility_km: f64,
        cloud_cover: f64,
    ) -> Result<(), JsValue> {
        let entity = self.station_entities
            .get(&station_id)
            .ok_or_else(|| JsValue::from_str("Station not found"))?;

        if let Ok(mut conditions) = self.world.get::<&mut AtmosphericConditions>(*entity) {
            conditions.cn2_turbulence = cn2;
            conditions.visibility_km = visibility_km;
            conditions.cloud_cover_percent = cloud_cover;
        }

        Ok(())
    }

    #[wasm_bindgen]
    pub fn station_count(&self) -> usize {
        self.station_entities.len()
    }

    #[wasm_bindgen]
    pub fn export_state(&self) -> Result<String, JsValue> {
        let mut state = serde_json::Map::new();

        for (id, entity) in &self.station_entities {
            if let Ok(position) = self.world.get::<&GeodeticPosition>(*entity) {
                if let Ok(angles) = self.world.get::<&DeclinationAngles>(*entity) {
                    let station_data = serde_json::json!({
                        "position": *position,
                        "declination_angles": *angles,
                    });
                    state.insert(id.clone(), station_data);
                }
            }
        }

        serde_json::to_string_pretty(&state)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}
