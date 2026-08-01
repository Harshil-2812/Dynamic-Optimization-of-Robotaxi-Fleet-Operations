# config.py - Module-level constants for the robotaxi simulation backend

# ---------------------------------------------------------------------------
# City Graph
# ---------------------------------------------------------------------------
CITY_GRID_SIZE = 10          # Number of nodes along each axis of the city grid
NUM_EDGES_PER_NODE = 3       # Average number of road edges per node (graph connectivity)
GRID_WIDTH_PX = 800          # Pixel width of the rendered city grid on the frontend

# ---------------------------------------------------------------------------
# Fleet
# ---------------------------------------------------------------------------
FLEET_SIZE = 15              # Total number of robotaxi vehicles in the simulation
ROLLING_HORIZON = 10         # Number of time steps looked ahead in the rolling-horizon optimizer

# ---------------------------------------------------------------------------
# Demand Model  (Poisson process parameters)
# ---------------------------------------------------------------------------
LAMBDA_0 = 0.2               # Base passenger arrival rate (requests per time step)
ALPHA = 0.2                  # Amplitude of the sinusoidal demand fluctuation
OMEGA = 0.628                # Angular frequency of demand oscillation (rad / time-step)

# ---------------------------------------------------------------------------
# Assignment Objective Weights
# ---------------------------------------------------------------------------
W1 = 0.4                     # Weight for passenger wait-time minimisation
W2 = 0.3                     # Weight for vehicle travel-distance minimisation
W3 = 0.3                     # Weight for energy-consumption minimisation

# ---------------------------------------------------------------------------
# Energy Consumption Model
# ---------------------------------------------------------------------------
BETA_1 = 0.05                # Linear speed coefficient in the energy equation
BETA_2 = 0.001               # Quadratic speed coefficient in the energy equation
GAMMA_1 = 2.3                # Load (passenger weight) factor for energy consumption
ETA = 0.02                   # Regenerative braking efficiency coefficient

# ---------------------------------------------------------------------------
# Simulation Timing
# ---------------------------------------------------------------------------
TICK_INTERVAL_SECONDS = 2.5  # Real-world seconds between each simulation tick
SIMULATION_STEPS = 10        # Total number of discrete time steps to run per episode
