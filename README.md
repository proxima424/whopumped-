# How to Use

* Clone the repository and navigate to the `back` directory. Copy the `.env.example` file to create a new `.env` file:
  ```bash
  cp .env.example .env
  ```

* Open the `.env` file and fill in your Twitter credentials:
  ```
  TWITTER_USERNAME=your_username
  TWITTER_PASSWORD=your_password
  PORT=3001
  ```

* Run the setup script to install dependencies and start both frontend and backend servers:
  ```bash
  chmod +x setup.sh
  ./setup.sh
  ```

* Once the servers are running, open your browser and navigate to `http://localhost:3000`. You can now:
  - Enter any token address to view its price chart
  - Paste a tweet URL to see when it was posted relative to the price action
