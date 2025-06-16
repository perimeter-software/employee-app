// /api/conversations/route.ts
import { NextResponse } from "next/server";
import { mongoConn } from "@/lib/db";
import { AuthenticatedRequest } from "@/domains/user/types";
import { withEnhancedAuthAPI } from "@/lib/middleware";
import {
  createConversation,
  getAllConversions,
} from "@/domains/conversation/utils/mongo-conversation-utils";
import { AiConversation, AiMessage } from "@/domains/conversation";

async function getConversationsHandler(request: AuthenticatedRequest) {
  try {
    const { db } = await mongoConn();

    // Get userId from the authenticated request
    const userId = request.user?.id || request.user?.sub;

    console.log("User ID from request:", userId);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "unauthorized", message: "User ID not found" },
        { status: 401 }
      );
    }

    const result = await getAllConversions(db, "12345");

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: "Conversations not found",
          message: "Conversations not found",
        },
        { status: 404 }
      );
    }

    // Return with 'data' field to match your ApiResponse type
    return NextResponse.json(
      {
        success: true,
        message: "Conversations found",
        data: result, // This will be { conversations: AiConversation[] }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in Conversations endpoint:", error);
    return NextResponse.json(
      {
        success: false,
        error: "internal-server-error",
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}

// POST - Create new conversation
async function createConversationHandler(request: AuthenticatedRequest) {
  try {
    const { db } = await mongoConn();

    const userId = request.user?.id || request.user?.sub;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "unauthorized", message: "User ID not found" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();

    const message: AiMessage = {
      role: "user",
      content:
        body.messages[0]?.content || "Hello, how can I assist you today?",
    };
    // Create conversation object
    const conversationData: AiConversation = {
      title: body.title,
      messages: message ? [message] : [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      id: undefined,
      userId: "12345",
    };

    console.log("Creating conversation:", conversationData);

    const result = await createConversation(db, conversationData);

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          error: "creation-failed",
          message: "Failed to create conversation",
        },
        { status: 500 }
      );
    }

    // Return success response
    return NextResponse.json(
      {
        success: true,
        message: "Conversation created successfully",
        data: result,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in Conversations endpoint:", error);
    return NextResponse.json(
      {
        success: false,
        error: "internal-server-error",
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getConversationsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

export const POST = withEnhancedAuthAPI(createConversationHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
