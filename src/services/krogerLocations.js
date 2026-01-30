import axios from 'axios';

const PROXY_BASE_URL = 'http://localhost:3001/api/kroger';

class KrogerLocationsService {
  /**
   * Search for Kroger stores by zip code
   */
  async searchByZipCode(zipCode, radiusMiles = 10, limit = 10) {
    try {
      const response = await axios.get(`${PROXY_BASE_URL}/locations`, {
        params: {
          zipCode: zipCode,
          radiusMiles: radiusMiles,
          limit: limit,
        },
      });

      return this.formatLocations(response.data.data);
    } catch (error) {
      console.error('Kroger Locations Search Error:', error);
      
      if (error.code === 'ERR_NETWORK') {
        throw new Error('Cannot connect to Kroger API. Make sure the proxy server is running.');
      }
      
      throw new Error('Failed to search Kroger stores. Please try again.');
    }
  }

  /**
   * Search for Kroger stores by coordinates
   */
  async searchByCoordinates(lat, lon, radiusMiles = 10, limit = 10) {
    try {
      const response = await axios.get(`${PROXY_BASE_URL}/locations`, {
        params: {
          lat: lat,
          lon: lon,
          radiusMiles: radiusMiles,
          limit: limit,
        },
      });

      return this.formatLocations(response.data.data);
    } catch (error) {
      console.error('Kroger Locations Search Error:', error);
      throw new Error('Failed to search Kroger stores. Please try again.');
    }
  }

  /**
   * Get detailed information about a specific location
   */
  async getLocationDetails(locationId) {
    try {
      const response = await axios.get(`${PROXY_BASE_URL}/locations/${locationId}`);
      return this.formatLocation(response.data.data);
    } catch (error) {
      console.error('Kroger Location Details Error:', error);
      throw new Error('Failed to get store details. Please try again.');
    }
  }

  /**
   * Format location data from Kroger API
   */
  formatLocation(location) {
    return {
      locationId: location.locationId,
      name: location.name,
      chain: location.chain,
      
      // Address
      address: {
        street: location.address?.addressLine1,
        city: location.address?.city,
        state: location.address?.state,
        zipCode: location.address?.zipCode,
        county: location.address?.county,
      },
      
      // Contact
      phone: location.phone,
      
      // Coordinates
      geolocation: {
        latitude: location.geolocation?.latitude,
        longitude: location.geolocation?.longitude,
      },
      
      // Hours
      hours: this.formatHours(location.hours),
      
      // Departments
      departments: location.departments || [],
      
      // Additional info
      pharmacy: location.departments?.some(d => d.departmentId === 'PHARMACY'),
      fuelCenter: location.departments?.some(d => d.departmentId === 'FUEL_CENTER'),
    };
  }

  /**
   * Format multiple locations
   */
  formatLocations(locations) {
    if (!locations || !Array.isArray(locations)) {
      return [];
    }
    return locations.map(loc => this.formatLocation(loc));
  }

  /**
   * Format store hours into readable format
   */
  formatHours(hoursData) {
    if (!hoursData) return null;

    const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const formatted = {};

    daysOfWeek.forEach(day => {
      const dayHours = hoursData[day];
      if (dayHours) {
        formatted[day] = {
          open: dayHours.open,
          close: dayHours.close,
          open24: dayHours.open24Hours || false,
        };
      }
    });

    return formatted;
  }

  /**
   * Get today's hours for a location
   */
  getTodayHours(location) {
    if (!location.hours) return null;

    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const todayHours = location.hours[today];

    if (!todayHours) return null;

    if (todayHours.open24) {
      return 'Open 24 hours';
    }

    return `${this.formatTime(todayHours.open)} - ${this.formatTime(todayHours.close)}`;
  }

  /**
   * Format time string (e.g., "06:00" -> "6:00 AM")
   */
  formatTime(timeString) {
    if (!timeString) return '';

    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;

    return `${displayHour}:${minutes} ${ampm}`;
  }

  /**
   * Calculate distance between two coordinates (in miles)
   * Uses Haversine formula
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 10) / 10; // Round to 1 decimal
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Format full address for display
   */
  formatAddress(location) {
    const addr = location.address;
    return `${addr.street}, ${addr.city}, ${addr.state} ${addr.zipCode}`;
  }

  /**
   * Get store status (open/closed)
   */
  getStoreStatus(location) {
    const todayHours = this.getTodayHoursObject(location);
    
    if (!todayHours) {
      return { isOpen: false, status: 'Unknown' };
    }

    if (todayHours.open24) {
      return { isOpen: true, status: 'Open 24 hours' };
    }

    const now = new Date();
    const currentTime = now.getHours() * 100 + now.getMinutes(); // e.g., 14:30 = 1430
    
    const openTime = parseInt(todayHours.open.replace(':', ''));
    const closeTime = parseInt(todayHours.close.replace(':', ''));

    const isOpen = currentTime >= openTime && currentTime < closeTime;

    if (isOpen) {
      return { 
        isOpen: true, 
        status: `Open until ${this.formatTime(todayHours.close)}` 
      };
    } else if (currentTime < openTime) {
      return { 
        isOpen: false, 
        status: `Opens at ${this.formatTime(todayHours.open)}` 
      };
    } else {
      return { 
        isOpen: false, 
        status: 'Closed' 
      };
    }
  }

  getTodayHoursObject(location) {
    if (!location.hours) return null;
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    return location.hours[today];
  }
}

export const krogerLocationsService = new KrogerLocationsService();