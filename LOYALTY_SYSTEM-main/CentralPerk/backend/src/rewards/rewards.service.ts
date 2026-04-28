import { Injectable, NotFoundException } from "@nestjs/common";

const rewards = [
  {
    id: "REWARD-001",
    name: "Free Pastry",
    description: "Choose from croissant, muffin, or danish",
    pointsCost: 150,
    category: "Food",
    status: "active",
  },
  {
    id: "REWARD-002",
    name: "Free Regular Coffee",
    description: "Any regular-sized hot or iced coffee",
    pointsCost: 120,
    category: "Beverage",
    status: "active",
  },
  {
    id: "REWARD-003",
    name: "Free Large Specialty Drink",
    description: "Any large-sized specialty beverage",
    pointsCost: 280,
    category: "Beverage",
    status: "active",
  },
];

@Injectable()
export class RewardsService {
  async list() {
    return rewards;
  }

  async get(id: string) {
    const reward = rewards.find((item) => item.id === id);
    if (!reward) throw new NotFoundException("Reward not found.");
    return reward;
  }
}
