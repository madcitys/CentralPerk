import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";

const app = new Hono();

// Create Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-3424be34/health", (c) => {
  return c.json({ status: "ok" });
});

// Register a new loyalty program member with auth
app.post("/make-server-3424be34/register", async (c) => {
  try {
    const body = await c.req.json();
    const { firstName, lastName, email, phone, password } = body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone || !password) {
      return c.json(
        { error: "All fields are required: firstName, lastName, email, phone, password" },
        400
      );
    }

    // Check if user already exists in loyalty_members table
    const { data: existingMember } = await supabase
      .from('loyalty_members')
      .select('*')
      .or(`email.eq.${email},phone_number.eq.${phone}`)
      .single();

    if (existingMember) {
      return c.json(
        { error: "An account with this email or phone number already exists. Please use the Login page." },
        400
      );
    }

    // Create user with Supabase Auth using admin API to auto-confirm email
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      user_metadata: { 
        first_name: firstName,
        last_name: lastName,
      },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true
    });

    if (authError) {
      console.error("Error creating auth user:", authError);
      return c.json(
        { error: `Failed to create user account: ${authError.message}` },
        500
      );
    }

    // Insert into loyalty_members table
    const { data: memberData, error: insertError } = await supabase
      .from('loyalty_members')
      .insert([
        {
          first_name: firstName,
          last_name: lastName,
          email: email,
          phone_number: phone,
        }
      ])
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting member:", insertError);
      
      // If member insert fails, clean up the auth user
      try {
        await supabase.auth.admin.deleteUser(authData.user.id);
      } catch (cleanupError) {
        console.error("Error cleaning up auth user:", cleanupError);
      }
      
      // Handle duplicate email/phone errors
      if (insertError.code === '23505') {
        if (insertError.message.includes('email')) {
          return c.json({ error: "Email already registered" }, 400);
        }
        if (insertError.message.includes('phone')) {
          return c.json({ error: "Phone number already registered" }, 400);
        }
        return c.json({ error: "Member already exists" }, 400);
      }
      
      return c.json(
        { error: `Failed to register member: ${insertError.message}` },
        500
      );
    }

    console.log(`Successfully registered member: ${memberData.member_number}`);
    
    return c.json({
      success: true,
      member: {
        id: memberData.id,
        memberNumber: memberData.member_number,
        firstName: memberData.first_name,
        lastName: memberData.last_name,
        email: memberData.email,
        phone: memberData.phone_number,
        currentPointsBalance: memberData.current_points_balance || 0,
        createdAt: memberData.created_at,
      },
    });
  } catch (error) {
    console.error("Error registering member:", error);
    return c.json(
      { error: `Failed to register member: ${error.message}` },
      500
    );
  }
});

// Register a new loyalty program member
app.post("/make-server-3424be34/register-member", async (c) => {
  try {
    const body = await c.req.json();
    const { firstName, lastName, email, phone } = body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone) {
      return c.json(
        { error: "All fields are required: firstName, lastName, email, phone" },
        400
      );
    }

    // Insert into loyalty_members table
    const { data, error } = await supabase
      .from('loyalty_members')
      .insert([
        {
          first_name: firstName,
          last_name: lastName,
          email: email,
          phone_number: phone,
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("Error inserting member:", error);
      
      // Handle duplicate email/phone errors
      if (error.code === '23505') {
        if (error.message.includes('email')) {
          return c.json({ error: "Email already registered" }, 400);
        }
        if (error.message.includes('phone')) {
          return c.json({ error: "Phone number already registered" }, 400);
        }
        return c.json({ error: "Member already exists" }, 400);
      }
      
      // Handle email validation errors
      if (error.code === '23514') {
        return c.json({ error: "Invalid email format" }, 400);
      }
      
      return c.json(
        { error: `Failed to register member: ${error.message}` },
        500
      );
    }

    console.log(`Successfully registered member: ${data.member_number}`);
    
    return c.json({
      success: true,
      member: {
        id: data.id,
        memberNumber: data.member_number,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        phone: data.phone_number,
        currentPointsBalance: data.current_points_balance || 0,
        createdAt: data.created_at,
      },
    });
  } catch (error) {
    console.error("Error registering member:", error);
    return c.json(
      { error: `Failed to register member: ${error.message}` },
      500
    );
  }
});

// Get all registered members
app.get("/make-server-3424be34/members", async (c) => {
  try {
    const { data, error } = await supabase
      .from('loyalty_members')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching members:", error);
      return c.json(
        { error: `Failed to fetch members: ${error.message}` },
        500
      );
    }

    const members = data.map(member => ({
      id: member.id,
      memberNumber: member.member_number,
      firstName: member.first_name,
      lastName: member.last_name,
      email: member.email,
      phone: member.phone_number,
      currentPointsBalance: member.current_points_balance || 0,
      createdAt: member.created_at,
    }));
    
    return c.json({
      success: true,
      members,
      count: members.length,
    });
  } catch (error) {
    console.error("Error fetching members:", error);
    return c.json(
      { error: `Failed to fetch members: ${error.message}` },
      500
    );
  }
});

// Add points to a member's account
app.post("/make-server-3424be34/add-points", async (c) => {
  try {
    const body = await c.req.json();
    const { memberId, points } = body;

    if (!memberId || points === undefined) {
      return c.json(
        { error: "memberId and points are required" },
        400
      );
    }

    if (points < 0) {
      return c.json(
        { error: "Points must be a positive number" },
        400
      );
    }

    // Get current member data
    const { data: member, error: fetchError } = await supabase
      .from('loyalty_members')
      .select('*')
      .eq('id', memberId)
      .single();

    if (fetchError || !member) {
      return c.json({ error: "Member not found" }, 404);
    }

    // Update points balance
    const newBalance = (member.current_points_balance || 0) + points;
    
    const { data: updatedMember, error: updateError } = await supabase
      .from('loyalty_members')
      .update({ current_points_balance: newBalance })
      .eq('id', memberId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating points:", updateError);
      return c.json(
        { error: `Failed to update points: ${updateError.message}` },
        500
      );
    }

    console.log(`Added ${points} points to member ${member.member_number}`);

    return c.json({
      success: true,
      member: {
        id: updatedMember.id,
        memberNumber: updatedMember.member_number,
        firstName: updatedMember.first_name,
        lastName: updatedMember.last_name,
        email: updatedMember.email,
        phone: updatedMember.phone_number,
        currentPointsBalance: updatedMember.current_points_balance,
        createdAt: updatedMember.created_at,
      },
    });
  } catch (error) {
    console.error("Error adding points:", error);
    return c.json(
      { error: `Failed to add points: ${error.message}` },
      500
    );
  }
});

// Get member by email
app.get("/make-server-3424be34/member/:email", async (c) => {
  try {
    const email = c.req.param("email");
    
    const { data: member, error } = await supabase
      .from('loyalty_members')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !member) {
      return c.json({ error: "Member not found" }, 404);
    }
    
    return c.json({
      success: true,
      member: {
        id: member.id,
        memberNumber: member.member_number,
        firstName: member.first_name,
        lastName: member.last_name,
        email: member.email,
        phone: member.phone_number,
        currentPointsBalance: member.current_points_balance || 0,
        createdAt: member.created_at,
      },
    });
  } catch (error) {
    console.error("Error fetching member:", error);
    return c.json(
      { error: `Failed to fetch member: ${error.message}` },
      500
    );
  }
});

Deno.serve(app.fetch);